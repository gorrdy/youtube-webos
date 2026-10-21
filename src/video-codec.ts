import { configRead } from './config';
import { JsonParseRegistry } from './hooks/json-parse';
import { getPlayerManager, PlayerMode } from './player_api';
import type { EventMapOf, PlayerManager, VideoQualityData } from './player_api';
import { forceVp09, isVp09MimeType } from './response-filters/vp9';

const AV1_CODEC = 'av01';
const VP9_FORMAT_IDS = new Set([
  '278',
  '242',
  '243',
  '244',
  '247',
  '248',
  '271',
  '302',
  '303',
  '308',
  '313',
  '315',
  '330',
  '331',
  '332',
  '333',
  '334',
  '335',
  '336',
  '337'
]);

function shouldForce() {
  return configRead('forceVp9Codec');
}

function isAv1MimeType(mimeType: string | undefined) {
  return mimeType?.includes(AV1_CODEC) ?? false;
}

export function isVp9FormatId(formatId: string | undefined) {
  return formatId !== undefined && VP9_FORMAT_IDS.has(formatId);
}

export function getPreferredVp9FormatId(
  qualityData: VideoQualityData[] | undefined
) {
  return qualityData?.find((format) => {
    return format.isPlayable && isVp9FormatId(format.formatId);
  })?.formatId;
}

JsonParseRegistry.getInstance().addFilter('video-codec', (r) => {
  if (shouldForce()) forceVp09(r);
});

const originalCanPlayType = HTMLMediaElement.prototype.canPlayType;
HTMLMediaElement.prototype.canPlayType = function (mimeType) {
  if (shouldForce()) {
    if (isAv1MimeType(mimeType)) return '';
    if (isVp09MimeType(mimeType)) return 'probably';
  }

  return originalCanPlayType.call(this, mimeType);
};

const originalIsTypeSupported = window.MediaSource?.isTypeSupported;
if (originalIsTypeSupported) {
  window.MediaSource.isTypeSupported = function (mimeType) {
    if (shouldForce()) {
      if (isAv1MimeType(mimeType)) return false;
      if (isVp09MimeType(mimeType)) return true;
    }

    return originalIsTypeSupported.call(this, mimeType);
  };
}

const originalDecodingInfo = navigator.mediaCapabilities?.decodingInfo;
if (originalDecodingInfo) {
  navigator.mediaCapabilities.decodingInfo = function (configuration) {
    const mimeType = configuration.video?.contentType;
    if (shouldForce() && isAv1MimeType(mimeType)) {
      return Promise.resolve({
        supported: false,
        smooth: false,
        powerEfficient: false,
        keySystemAccess: null
      });
    }

    return originalDecodingInfo.call(this, configuration);
  };
}

type EventMap = EventMapOf<PlayerManager>;

function setVp09PlaybackFormat(this: PlayerManager, _: unknown) {
  if (this.playerMode === PlayerMode.PREVIEW) return;

  this.removeEventListener('playbackStart', setVp09PlaybackFormat);

  const formatId = getPreferredVp9FormatId(
    this.player.getAvailableQualityData()
  );
  if (!formatId) {
    console.warn('[video-codec] No playable VP09 formatId available');
    return;
  }

  console.info(`[video-codec] Selecting VP09 formatId ${formatId}`);
  this.player.setPlaybackQualityRange('highres', 'highres', formatId);
}

function handleNewVideo(this: PlayerManager, _: EventMap['newVideo']) {
  if (!shouldForce()) return;

  this.removeEventListener('playbackStart', setVp09PlaybackFormat);
  this.addEventListener('playbackStart', setVp09PlaybackFormat);
}

void getPlayerManager().then((playerManager) => {
  playerManager.addEventListener('newVideo', handleNewVideo);
});
