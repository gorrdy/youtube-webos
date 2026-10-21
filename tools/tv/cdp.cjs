#!/usr/bin/env node
// Talks to the app running on the TV over the Chrome DevTools Protocol.
//
// The webOS inspector (TV port 9998) is reached through an SSH tunnel on
// 127.0.0.1:19998, which `deploy.sh` sets up. Connecting through localhost
// also avoids macOS blocking local network access for node.
//
//   node tools/tv/cdp.cjs eval '<expression>'   evaluate in the page, print result
//   node tools/tv/cdp.cjs key <keyCode>         send a remote key (461 back, 13 OK, 403 red)
//   node tools/tv/cdp.cjs monitor [seconds] [console-regex]
//                                               log player state changes and matching console output

const http = require('node:http');
const WebSocket = require('ws');

const INSPECTOR = 'http://127.0.0.1:19998/json';
const STATES = {
  '-1': 'UNSTARTED',
  0: 'ENDED',
  1: 'PLAYING',
  2: 'PAUSED',
  3: 'BUFFERING',
  5: 'CUED'
};

const PLAYER_PROBE = `(() => {
  const p = document.querySelector('.html5-video-player');
  const v = document.querySelector('video');
  if (!p || !p.getPlayerState) return null;
  const b = v && v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
  return {
    vid: (p.getVideoData && p.getVideoData().video_id) || '-',
    state: p.getPlayerState(),
    q: p.getPlaybackQualityLabel ? p.getPlaybackQualityLabel() : '',
    t: v ? +v.currentTime.toFixed(1) : null,
    buf: v ? +(b - v.currentTime).toFixed(1) : null,
    rs: v ? v.readyState : null
  };
})()`;

function getPageUrl() {
  return new Promise((resolve, reject) => {
    http
      .get(INSPECTOR, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          const page = JSON.parse(body).find((p) =>
            p.url.includes('youtube.com/tv')
          );
          if (page) resolve(page.webSocketDebuggerUrl);
          else reject(new Error('YouTube page not found; is the app running?'));
        });
      })
      .on('error', () =>
        reject(
          new Error(
            `No inspector on ${INSPECTOR}; run deploy.sh or open the tunnel`
          )
        )
      );
  });
}

async function connect() {
  const ws = new WebSocket(await getPageUrl());
  let nextId = 1;
  const pending = new Map();
  const listeners = [];

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result ?? { exceptionDetails: msg.error });
      pending.delete(msg.id);
    } else {
      for (const listener of listeners) listener(msg);
    }
  });
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = nextId++;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description || res.exceptionDetails.text
      );
    }
    return res.result?.value;
  };

  return {
    ws,
    send,
    evaluate,
    onEvent: (listener) => listeners.push(listener)
  };
}

async function monitor(cdp, seconds, consoleFilter) {
  const t0 = Date.now();
  const log = (line) =>
    console.log(
      `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${line}`
    );

  cdp.onEvent((msg) => {
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args
        .map((a) => a.value ?? a.description ?? a.type)
        .join(' ');
      // Runtime.enable replays recent console history first; skip it.
      if (Date.now() - t0 > 500 && consoleFilter.test(text))
        log(`console.${msg.params.type}: ${text.slice(0, 200)}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      log(`EXCEPTION: ${(d.exception?.description || d.text).split('\n')[0]}`);
    } else if (msg.method === 'Log.entryAdded') {
      // Browser messages, e.g. requests blocked by CORS or mixed content.
      const e = msg.params.entry;
      if (Date.now() - t0 > 500 && consoleFilter.test(e.text))
        log(`log.${e.level}: ${e.text.slice(0, 200)} ${e.url || ''}`);
    }
  });
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');

  let last = '';
  const timer = setInterval(async () => {
    const s = await cdp.evaluate(PLAYER_PROBE).catch(() => null);
    const line = s
      ? `${s.vid} ${STATES[s.state] ?? s.state} q=${s.q} rs=${s.rs} buf=${s.buf}s`
      : 'no player';
    if (line !== last) log(`${line} t=${s?.t}`);
    last = line;
  }, 300);

  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  clearInterval(timer);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const cdp = await connect();
  try {
    if (command === 'eval') {
      const value = await cdp.evaluate(args[0]);
      console.log(
        typeof value === 'string' ? value : JSON.stringify(value, null, 1)
      );
    } else if (command === 'key') {
      const code = Number(args[0]);
      await cdp.evaluate(
        `['keydown', 'keyup'].forEach((type) => document.dispatchEvent(new KeyboardEvent(type, { keyCode: ${code}, which: ${code}, bubbles: true })))`
      );
    } else if (command === 'monitor') {
      await monitor(
        cdp,
        Number(args[0] || 60),
        new RegExp(args[1] || '\\[[a-z-]+\\]', 'i')
      );
    } else {
      console.error(
        'usage: cdp.cjs eval <expression> | key <keyCode> | monitor [seconds] [console-regex]'
      );
      process.exitCode = 2;
    }
  } finally {
    cdp.ws.close();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
