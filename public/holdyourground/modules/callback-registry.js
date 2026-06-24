const _cb = {
  roomList: null,
  authSuccess: null,
  guestJoined: null,
  lobbyCount: null
};

export const callbacks = _cb;

export function onRoomList(cb) { _cb.roomList = cb; }
export function onAuthSuccess(cb) { _cb.authSuccess = cb; }
export function onGuestJoined(cb) { _cb.guestJoined = cb; }
export function onLobbyCount(cb) { _cb.lobbyCount = cb; }
