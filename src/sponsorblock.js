import sha256 from 'tiny-sha256';
import { configRead } from './config';
import { getKeyColor } from './remote-keys.js';
import { getValidSegments } from './sponsorblock-segments.js';
import { showNotification } from './ui';

// Copied from https://github.com/ajayyy/SponsorBlock/blob/9392d16617d2d48abb6125c00e2ff6042cb7bebe/src/config.ts#L179-L233
const barTypes = {
  sponsor: {
    color: '#00d400',
    opacity: '0.7',
    name: 'sponsored segment'
  },
  intro: {
    color: '#00ffff',
    opacity: '0.7',
    name: 'intro'
  },
  outro: {
    color: '#0202ed',
    opacity: '0.7',
    name: 'outro'
  },
  interaction: {
    color: '#cc00ff',
    opacity: '0.7',
    name: 'interaction reminder'
  },
  selfpromo: {
    color: '#ffff00',
    opacity: '0.7',
    name: 'self-promotion'
  },
  music_offtopic: {
    color: '#ff9900',
    opacity: '0.7',
    name: 'non-music part'
  },
  preview: {
    color: '#008fd6',
    opacity: '0.7',
    name: 'recap or preview'
  }
};

const sponsorblockAPI = 'https://sponsorblock.inf.re/api';

class SponsorBlockHandler {
  video = null;
  active = true;

  attachVideoTimeout = null;
  nextSkipTimeout = null;

  slider = null;
  sliderInterval = null;
  sliderObserver = null;
  sliderSegmentsOverlay = null;

  scheduleSkipHandler = null;
  durationChangeHandler = null;
  keyHandler = null;
  pendingSkip = null;
  fetchController = null;
  segments = null;
  skippableCategories = [];

  constructor(videoID) {
    this.videoID = videoID;
  }

  async init() {
    const videoHash = sha256(this.videoID).substring(0, 4);
    const categories = [
      'sponsor',
      'intro',
      'outro',
      'interaction',
      'selfpromo',
      'music_offtopic',
      'preview'
    ];
    // Not available on older webOS.
    this.fetchController =
      typeof AbortController === 'function' ? new AbortController() : null;
    const resp = await fetch(
      `${sponsorblockAPI}/skipSegments/${videoHash}?categories=${encodeURIComponent(
        JSON.stringify(categories)
      )}`,
      {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: this.fetchController?.signal
      }
    );
    if (!this.active) return;
    if (!resp.ok) {
      console.debug(this.videoID, 'No segments found.', resp.status);
      return;
    }
    const results = await resp.json();
    // Destroyed while loading, e.g. the user moved on to another video.
    if (!this.active) return;

    const segments = getValidSegments(results, this.videoID, categories);
    console.debug(this.videoID, 'Got it:', segments);

    if (!segments.length) {
      console.debug(this.videoID, 'No segments found.');
      return;
    }

    this.segments = segments;
    this.skippableCategories = this.getSkippableCategories();

    this.scheduleSkipHandler = () => this.scheduleSkip();
    this.durationChangeHandler = () => this.buildOverlay();

    this.keyHandler = (evt) => this.handleKey(evt);
    document.addEventListener('keydown', this.keyHandler, true);
    document.addEventListener('keypress', this.keyHandler, true);
    document.addEventListener('keyup', this.keyHandler, true);

    this.attachVideo();
    this.buildOverlay();
  }

  getSkippableCategories() {
    const skippableCategories = [];
    if (configRead('enableSponsorBlockSponsor')) {
      skippableCategories.push('sponsor');
    }
    if (configRead('enableSponsorBlockIntro')) {
      skippableCategories.push('intro');
    }
    if (configRead('enableSponsorBlockOutro')) {
      skippableCategories.push('outro');
    }
    if (configRead('enableSponsorBlockInteraction')) {
      skippableCategories.push('interaction');
    }
    if (configRead('enableSponsorBlockSelfPromo')) {
      skippableCategories.push('selfpromo');
    }
    if (configRead('enableSponsorBlockMusicOfftopic')) {
      skippableCategories.push('music_offtopic');
    }
    if (configRead('enableSponsorBlockPreview')) {
      skippableCategories.push('preview');
    }
    return skippableCategories;
  }

  attachVideo() {
    clearTimeout(this.attachVideoTimeout);
    this.attachVideoTimeout = null;

    this.video = document.querySelector('video');
    if (!this.video) {
      console.debug(this.videoID, 'No video yet...');
      this.attachVideoTimeout = setTimeout(() => this.attachVideo(), 100);
      return;
    }

    console.debug(this.videoID, 'Video found, binding...');

    this.video.addEventListener('play', this.scheduleSkipHandler);
    this.video.addEventListener('pause', this.scheduleSkipHandler);
    this.video.addEventListener('timeupdate', this.scheduleSkipHandler);
    this.video.addEventListener('durationchange', this.durationChangeHandler);
  }

  buildOverlay() {
    if (this.sliderSegmentsOverlay) {
      console.debug('Overlay already built');
      return;
    }

    if (!this.video || !this.video.duration) {
      console.debug('No video duration yet');
      return;
    }

    const videoDuration = this.video.duration;

    this.sliderSegmentsOverlay = document.createElement('div');
    this.sliderSegmentsOverlay.className =
      'ytaf-sponsorblock-segment-container';

    this.segments.forEach((segment) => {
      const [start, end] = segment.segment;
      const barType = barTypes[segment.category] || {
        color: 'blue'
      };
      const elm = document.createElement('div');
      elm.className = 'ytaf-sponsorblock-segment';
      elm.style['background-color'] = barType.color;
      elm.style['left'] = `${(start / videoDuration) * 100.0}%`;
      elm.style['width'] = `${((end - start) / videoDuration) * 100.0}%`;
      this.sliderSegmentsOverlay.appendChild(elm);
    });

    const addSliderObserver = (ele) => {
      this.sliderObserver.observe(ele, {
        childList: true,
        subtree: true
      });
    };

    const addSliderOverlay = () => {
      this.slider.appendChild(this.sliderSegmentsOverlay);
    };

    const watchForSlider = () => {
      if (this.sliderInterval) clearInterval(this.sliderInterval);

      this.sliderInterval = setInterval(() => {
        const nodes = document.querySelectorAll('[idomkey=progress-bar]');
        const last = nodes[nodes.length - 1];
        switch (nodes.length) {
          case 3: {
            // Slider has chapter markers.
            this.slider = last;
            break;
          }
          case 2: {
            // Slider has no markers or auto-markers
            this.slider = last.querySelector('[idomkey=slider]');
            break;
          }
          default: {
            return; // no slider found yet
          }
        }

        console.debug('slider found...', this.slider);
        clearInterval(this.sliderInterval);
        this.sliderInterval = null;
        addSliderObserver(last);
        addSliderOverlay();
      }, 100);
    };

    this.sliderObserver = new MutationObserver((mutations) => {
      mutations.forEach((m) => {
        if (m.removedNodes) {
          for (const node of m.removedNodes) {
            if (node === this.sliderSegmentsOverlay) {
              console.debug('bringing back segments overlay');
              addSliderOverlay();
            }
            if (node === this.slider) {
              console.debug('slider removed, watching again');
              this.sliderObserver.disconnect();
              watchForSlider();
            }
          }
        }
      });
    });

    watchForSlider();
  }

  scheduleSkip() {
    clearTimeout(this.nextSkipTimeout);
    this.nextSkipTimeout = null;

    if (!this.active) {
      console.debug(this.videoID, 'No longer active, ignoring...');
      return;
    }

    if (this.video.paused) {
      console.debug(this.videoID, 'Currently paused, ignoring...');
      return;
    }

    // Sometimes timeupdate event (that calls scheduleSkip) gets fired right before
    // already scheduled skip routine below. Let's just look back a little bit
    // and, in worst case, perform a skip at negative interval (immediately)...
    const nextSegments = this.segments.filter(
      (seg) =>
        seg.segment[0] > this.video.currentTime - 0.3 &&
        // Strictly ahead, so landing on a segment's end after skipping it
        // doesn't pick the same (or an overlapping) segment up again.
        seg.segment[1] > this.video.currentTime + 0.05 &&
        // Segments past the end of the video would skip to its end.
        !(seg.segment[0] > this.video.duration)
    );
    nextSegments.sort((s1, s2) => s1.segment[0] - s2.segment[0]);

    if (!nextSegments.length) {
      console.debug(this.videoID, 'No more segments');
      return;
    }

    const [segment] = nextSegments;
    const [start, end] = segment.segment;
    console.debug(
      this.videoID,
      'Scheduling skip of',
      segment,
      'in',
      start - this.video.currentTime
    );

    this.nextSkipTimeout = setTimeout(
      () => {
        if (this.video.paused) {
          console.debug(this.videoID, 'Currently paused, ignoring...');
          return;
        }
        if (!this.skippableCategories.includes(segment.category)) {
          console.debug(
            this.videoID,
            'Segment',
            segment.category,
            'is not skippable, ignoring...'
          );
          return;
        }

        const skipName = barTypes[segment.category]?.name || segment.category;

        if (configRead('enableSponsorBlockManualSkip')) {
          this.promptSkip(segment, skipName);
          return;
        }

        console.debug(this.videoID, 'Skipping', segment);
        showNotification(`Skipping ${skipName}`, 2000, 'indigo');
        this.video.currentTime = end;
        this.scheduleSkip();
      },
      // Delays over 2^31 ms overflow and would fire immediately.
      Math.min((start - this.video.currentTime) * 1000, 2 ** 31 - 1)
    );
  }

  /** Offer to skip `segment` with the red button instead of skipping it. */
  promptSkip(segment, skipName) {
    // `scheduleSkip` looks back a little, so it can fire twice per segment.
    if (this.pendingSkip === segment) return;

    const [, end] = segment.segment;
    this.pendingSkip = segment;
    console.debug(this.videoID, 'Offering to skip', segment);

    const remaining = Math.min(end - this.video.currentTime, 10);
    showNotification(`Press RED to skip ${skipName}`, remaining * 1000, 'red');
  }

  handleKey(evt) {
    if (getKeyColor(evt.keyCode || evt.charCode) !== 'red') return;

    const segment = this.pendingSkip;
    if (!segment) return;

    // Only while the offered segment is playing; don't hold the red button
    // for the rest of the video.
    const [start, end] = segment.segment;
    const time = this.video.currentTime;
    if (time < start - 1 || time >= end) {
      this.pendingSkip = null;
      return;
    }

    evt.preventDefault();
    evt.stopPropagation();
    if (evt.type !== 'keydown') return;

    const skipName = barTypes[segment.category]?.name || segment.category;
    console.debug(this.videoID, 'Skipping on request', segment);
    showNotification(`Skipping ${skipName}`, 2000, 'indigo');
    this.pendingSkip = null;
    this.video.currentTime = segment.segment[1];
  }

  destroy() {
    console.debug(this.videoID, 'Destroying');

    this.active = false;
    this.fetchController?.abort();

    if (this.keyHandler) {
      document.removeEventListener('keydown', this.keyHandler, true);
      document.removeEventListener('keypress', this.keyHandler, true);
      document.removeEventListener('keyup', this.keyHandler, true);
      this.keyHandler = null;
    }

    if (this.nextSkipTimeout) {
      clearTimeout(this.nextSkipTimeout);
      this.nextSkipTimeout = null;
    }

    if (this.attachVideoTimeout) {
      clearTimeout(this.attachVideoTimeout);
      this.attachVideoTimeout = null;
    }

    if (this.sliderInterval) {
      clearInterval(this.sliderInterval);
      this.sliderInterval = null;
    }

    if (this.sliderObserver) {
      this.sliderObserver.disconnect();
      this.sliderObserver = null;
    }

    if (this.sliderSegmentsOverlay) {
      this.sliderSegmentsOverlay.remove();
      this.sliderSegmentsOverlay = null;
    }

    if (this.video) {
      this.video.removeEventListener('play', this.scheduleSkipHandler);
      this.video.removeEventListener('pause', this.scheduleSkipHandler);
      this.video.removeEventListener('timeupdate', this.scheduleSkipHandler);
      this.video.removeEventListener(
        'durationchange',
        this.durationChangeHandler
      );
    }
  }
}

// When this global variable was declared using let and two consecutive hashchange
// events were fired (due to bubbling? not sure...) the second call handled below
// would not see the value change from first call, and that would cause multiple
// SponsorBlockHandler initializations... This has been noticed on Chromium 38.
// This either reveals some bug in chromium/webpack/babel scope handling, or
// shows my lack of understanding of javascript. (or both)
window.sponsorblock = null;

function uninitializeSponsorblock() {
  if (!window.sponsorblock) {
    return;
  }
  try {
    window.sponsorblock.destroy();
  } catch (err) {
    console.warn('window.sponsorblock.destroy() failed!', err);
  }
  window.sponsorblock = null;
}

function handleLocationChange() {
  const newURL = new URL(location.hash.substring(1), location.href);
  // uninitialize sponsorblock when not on `/watch` path, to prevent
  // it from attaching to playback preview video element loaded on
  // home page
  if (newURL.pathname !== '/watch' && window.sponsorblock) {
    console.debug('uninitializing sponsorblock on a non-video page');
    uninitializeSponsorblock();
    return;
  }

  const videoID = newURL.searchParams.get('v');
  const needsReload =
    videoID && (!window.sponsorblock || window.sponsorblock.videoID != videoID);

  console.debug(
    'hashchange',
    videoID,
    window.sponsorblock,
    window.sponsorblock ? window.sponsorblock.videoID : null,
    needsReload
  );

  if (needsReload) {
    uninitializeSponsorblock();

    if (configRead('enableSponsorBlock')) {
      window.sponsorblock = new SponsorBlockHandler(videoID);
      window.sponsorblock.init().catch((err) => {
        // Aborted when the video changes while segments are loading.
        if (err?.name !== 'AbortError') {
          console.warn('SponsorBlock failed to load segments', err);
        }
      });
    } else {
      console.info('SponsorBlock disabled, not loading');
    }
  }
}

window.addEventListener('hashchange', handleLocationChange, false);

// The app can start directly on a video (deep link, cast, autostart), where
// no `hashchange` fires for it.
handleLocationChange();
