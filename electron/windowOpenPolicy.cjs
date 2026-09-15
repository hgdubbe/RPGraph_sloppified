function roleplayWindowOpenHandlerResponse(details) {
  if (details?.url !== 'about:blank' || details?.frameName !== 'rpgraph-roleplay-popout') {
    return { action: 'deny' };
  }
  return {
    action: 'allow',
    outlivesOpener: true,
    overrideBrowserWindowOptions: {
      show: true,
      frame: true,
      title: 'RPGraph Roleplay',
      backgroundColor: '#131b28',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    },
  };
}

module.exports = {
  roleplayWindowOpenHandlerResponse,
};
