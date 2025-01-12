import { spawn } from 'child_process';
import { OBSWebSocket } from 'obs-websocket-js';
// import ffmpeg from 'fluent-ffmpeg';

// Configuration
const inputStreamUrl = 'rist://@192.168.0.6:11000?cname=ristwan&bandwidth=3000';
const outputStreamUrl = 'rist://127.0.0.1:11001?cname=ristlocal&bandwidth=3000';
const bitrateThreshold = 500; // Lowest acceptable bitrate, in kbps, before switching scenes.
const obsWebSocketIp = '127.0.0.1';
const obsWebSocketPort = '4455';
const obsWebSocketPassword = 'zCiB7HwYxlREK9km';
const lowBitrateSceneName = 'Low Bitrate';
let liveSceneName = 'Live';

const obs = new OBSWebSocket();

// Function to connect to the OBS WebSocket server
async function startObsWebSocket() {
  console.log('Connecting to OBS WebSocket server...');

  try {
    const {
      obsWebSocketVersion,
      negotiatedRpcVersion
    } = await obs.connect(`ws://${obsWebSocketIp}:${obsWebSocketPort}`, obsWebSocketPassword);
    console.log(`Connected to server ${obsWebSocketVersion} (using RPC ${negotiatedRpcVersion})`);
  } catch (error) {
    console.error('Failed to connect to OBS WebSocket server.', error.code, error.message);
  }
}

// Function to start FFmpeg process
function startFfmpeg() {
  console.log('Starting FFmpeg...');

  const ffmpeg = spawn('ffmpeg', [
    '-i', inputStreamUrl,
    '-c', 'copy',
    '-f', 'mpegts',
    outputStreamUrl,
    // FFmpeg logs will have a log level prepended.
    '-loglevel', 'level+info'
  ]);

  ffmpeg.stdout.on('data', (data) => {
    // All ffmpeg output goes to stderr. See: https://stackoverflow.com/questions/35169650/differentiate-between-error-and-standard-terminal-log-with-ffmpeg-nodejs/35215447#35215447
  });

  ffmpeg.stderr.on('data', (data) => {
    const output = data.toString();
    console.log(output);

    // Monitor bitrate
    const bitrateMatch = output.match(/bitrate=\s*([0-9.]+)kbits/);
    if (bitrateMatch) {
      const bitrate = parseFloat(bitrateMatch[1]);
      monitorStreamHealth({ bitrate });
    }
  });

  ffmpeg.on('close', (code) => {
    console.log(`FFmpeg exited with code ${code}`);
  });

  ffmpeg.on('exit', (code) => {
    console.error('WARNING! FFmpeg exited! This can be safely ignored if you triggered a shutdown. FFmpeg exit code=', code);
  });

  ffmpeg.on('error', (error) => {
    console.error('Cannot process input:', error);
  });

  console.log('Started FFmpeg RIST stream relay.');
  return ffmpeg;
}

// Monitor stream health and switch scenes when bitrate is low.
async function monitorStreamHealth({ bitrate }) {
  console.log(`Current Bitrate: ${bitrate} kbits/s`);
  if (bitrate < bitrateThreshold) {
    console.log(`Low bitrate detected (${bitrate} kbps). Switching OBS scene...`);

    try {
      await obs.call('SetCurrentProgramScene', { sceneName: lowBitrateSceneName });
      console.log(`Switched to Low Bitrate scene: ${response.status}`);
    } catch (error) {
      console.error('Failed to switch to Low Bitrate scene:', error.message);
    }
  }
}

// Main Execution
(async () => {
  console.log('Initializing...');
  await startObsWebSocket();
  const ffmpegCommand = startFfmpeg();

  // Graceful Shutdown
  process.on('SIGINT', async () => {
    console.log('Stopping FFmpeg...');
    ffmpegCommand.kill('SIGINT');
    console.log('Disconnecting from OBS WebSocket server...');
    await obs.disconnect();
    process.exit();
  });
})();

// TODO: Calculate average bitrate over time. Will solve the issue of reading 0 bitrate on the first frame. Will also detect stream drops.
// TODO: Switch back to liveSceneName when the input stream is healthy.
// TODO: Expose an API to control OBS remotely, like change scenes, enable/disable scene auto-switching, set "liveSceneName", start/stop streaming. Next.js app?
// TODO: Containerize RIST stream relay application. One instance per input stream. The controller API should be separate.

// Handy dandy OBS WebSocket reference: https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
