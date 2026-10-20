import { configRead } from './config';
import { getPlayerManager, PlayerMode } from './player_api';
import type { EventMapOf, PlayerManager, VideoID } from './player_api';
import { showNotification } from './ui';
import { getPreferredVp9FormatId } from './video-codec';

const playerManager = await getPlayerManager();

function shouldForce() {
  return configRead('forceHighResVideo');
}

type EventMap = EventMapOf<PlayerManager>;

function getMaxQualityLabel(player: PlayerManager['player']) {
  return player.getAvailableQualityData()[0]?.qualityLabel;
}

function notifyPlaybackQuality(this: PlayerManager) {
  if (!shouldForce()) return;

  const player = this.player;

  const selected = player.getPlaybackQualityLabel();
  const max = getMaxQualityLabel(player);

  showNotification(`${selected} selected (Max ${max})`, 3000);

  this.removeEventListener('playbackStart', notifyPlaybackQuality);
}

/**
 * Switching quality while a video resumes from a saved position can reset the
 * `<video>` element to 0, where nothing is buffered, and playback stalls until
 * the user presses play. Seek back to the resume position if that happens.
 */
function restoreResumePosition(
  player: PlayerManager['player'],
  resumeTime: number
) {
  const RESTORE_WINDOW_MS = 5000;
  const POLL_MS = 100;
  const started = Date.now();

  const intervalToken = window.setInterval(() => {
    const video = player.querySelector('video');
    if (!video || Date.now() - started > RESTORE_WINDOW_MS) {
      clearInterval(intervalToken);
      return;
    }

    if (video.currentTime >= 1) {
      // Playback position survived the quality switch.
      if (
        !video.paused &&
        video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
      ) {
        clearInterval(intervalToken);
      }
      return;
    }

    console.info(
      `[video-quality] position reset to ${video.currentTime.toFixed(1)}s, seeking back to ${resumeTime.toFixed(1)}s`
    );
    clearInterval(intervalToken);
    player.seekTo(resumeTime, true);
  }, POLL_MS);
}

function setPlaybackQuality(this: PlayerManager, _: unknown) {
  if (this.playerMode === PlayerMode.PREVIEW) return;

  console.debug('[video-quality] setting playback quality');
  this.removeEventListener('playbackStart', setPlaybackQuality);

  const prevQuality = this.player.getPlaybackQualityLabel();
  const resumeTime = this.player.getCurrentTime();
  const formatId = configRead('forceVp9Codec')
    ? getPreferredVp9FormatId(this.player.getAvailableQualityData())
    : undefined;
  this.player.setPlaybackQualityRange('highres', 'highres', formatId);

  if (resumeTime >= 1) restoreResumePosition(this.player, resumeTime);

  if (prevQuality === getMaxQualityLabel(this.player)) {
    notifyPlaybackQuality.call(this);
    return;
  }

  let timeoutToken: number | undefined;

  // No reliable event for quality change, so poll for it
  const intervalToken = window.setInterval(() => {
    const currQuality = this.player.getPlaybackQualityLabel();
    if (currQuality !== prevQuality) {
      notifyPlaybackQuality.call(this);
      clearInterval(intervalToken);
      clearTimeout(timeoutToken);
    }
  }, 100);

  timeoutToken = window.setTimeout(() => {
    console.warn('[video-quality] timed out waiting for quality change');
    clearInterval(intervalToken);
    notifyPlaybackQuality.call(this);
  }, 3000);
}

function handleNewVideo(this: PlayerManager, _: EventMap['newVideo']) {
  if (!shouldForce()) return;

  this.removeEventListener('playbackStart', setPlaybackQuality);
  this.addEventListener('playbackStart', setPlaybackQuality);
}

playerManager.addEventListener('newVideo', handleNewVideo);
