import { Settings } from "./component/settings_menu"

const trueDefaultSettings: Settings =

{
    // possible values: "left", "right", "up", "down"
    "sidebarEdge": "left",
    "hideSidebarButton": false,
    "bitrate": 10000,
    "fps": 60,
    // possible values: "720p", "1080p", "1440p", "4k", "native", "custom"
    "videoSize": "custom",
    // only works if videoSize=custom
    "videoSizeCustom": {
        "width": 1920,
        "height": 1080
    },
    // possible values: "h264", "h265", "av1", "auto"
    "videoCodec": "h264",
    "forceVideoElementRenderer": false,
    "canvasRenderer": false,
    // Canvas only: when true, draw only on requestAnimationFrame (stable, may add ~0–17 ms). When false, draw on frame submit (low latency).
    "canvasVsync": false,
    // PrimSec: звук остаётся и на компьютере (как у гостей с компьютеров)
    "playAudioLocal": true,
    "microphone": false,
    // possible values: "highres", "normal"
    "mouseScrollMode": "highres",
    // possible values: "relative", "follow", "pointAndDrag"
    "mouseMode": "follow",
    // possible values: "touch", "mouseRelative", "localCursor", "pointAndDrag"
    // PrimSec: тачпад со своим курсором — движок приёма не рисует курсор в видео
    "touchMode": "localCursor",
    "localCursorSensitivity": 1,
    "controllerConfig": {
        "invertAB": false,
        "invertXY": false,
        // possible values: null or a number, example: 60, 120
        "sendIntervalOverride": null
    },
    // possible values: "auto", "webrtc", "websocket"
    "dataTransport": "auto",
    "language": "ru-RU",
    "enterFullscreenOnStreamStart": false,
    "toggleFullscreenWithKeybind": false,
    // possible values: "standard", "old"
    "pageStyle": "standard",
    "hdr": false,
    "useSelectElementPolyfill": false
}

export default trueDefaultSettings as Settings
