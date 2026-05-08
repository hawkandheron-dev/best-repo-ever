import {
  LOAD_PDF, LOAD_ERROR,
  START_SYNC, PAUSE_SYNC, RESUME_SYNC, RESET_SYNC,
  SET_POSITION, ADD_MARKER, REMOVE_MARKER, ADJUST_OFFSET, RESET_PDF,
} from './screenwplayActions';
import { addMarker } from './syncEngine';

export function buildInitialState() {
  return {
    loadStatus: 'idle',
    error: null,
    pdfDoc: null,
    numPages: 0,
    pageData: [],
    syncStatus: 'idle',
    startWallTime: null,
    pausedElapsedMs: 0,
    markers: [],
    currentPageNum: 1,
    currentLineIndex: 0,
    offsetMs: 0,
  };
}

export function screenwplayReducer(state, action) {
  switch (action.type) {
    case LOAD_PDF:
      return {
        ...state,
        loadStatus: 'ready',
        error: null,
        pdfDoc: action.pdfDoc,
        numPages: action.numPages,
        pageData: action.pageData,
        syncStatus: 'idle',
        startWallTime: null,
        pausedElapsedMs: 0,
        markers: [],
        currentPageNum: 1,
        currentLineIndex: 0,
        offsetMs: 0,
      };

    case LOAD_ERROR:
      return { ...state, loadStatus: 'error', error: action.error };

    case RESET_PDF:
      return buildInitialState();

    case START_SYNC:
      return {
        ...state,
        syncStatus: 'running',
        startWallTime: Date.now(),
        pausedElapsedMs: 0,
        markers: [],
        currentPageNum: 1,
        currentLineIndex: 0,
        offsetMs: 0,
      };

    case PAUSE_SYNC: {
      const elapsedMs = Date.now() - state.startWallTime + state.pausedElapsedMs;
      return {
        ...state,
        syncStatus: 'paused',
        pausedElapsedMs: elapsedMs,
        startWallTime: null,
      };
    }

    case RESUME_SYNC:
      return {
        ...state,
        syncStatus: 'running',
        startWallTime: Date.now(),
      };

    case RESET_SYNC:
      return {
        ...state,
        syncStatus: 'idle',
        startWallTime: null,
        pausedElapsedMs: 0,
        markers: [],
        currentPageNum: 1,
        currentLineIndex: 0,
        offsetMs: 0,
      };

    case SET_POSITION:
      return {
        ...state,
        currentPageNum: action.pageNum,
        currentLineIndex: action.lineIndex,
      };

    case ADD_MARKER: {
      const elapsedMs =
        state.syncStatus === 'running'
          ? Date.now() - state.startWallTime + state.pausedElapsedMs + state.offsetMs
          : state.pausedElapsedMs + state.offsetMs;
      const newMarkers = addMarker(state.markers, elapsedMs, action.pageNum, 0);
      return { ...state, markers: newMarkers };
    }

    case REMOVE_MARKER:
      return {
        ...state,
        markers: state.markers.filter((_, i) => i !== action.index),
      };

    case ADJUST_OFFSET:
      return { ...state, offsetMs: state.offsetMs + action.deltaMs };

    default:
      return state;
  }
}
