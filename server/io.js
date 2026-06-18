let _io = null;

function setIo(instance) {
  _io = instance;
}

function getIo() {
  return _io;
}

module.exports = { setIo, getIo };
