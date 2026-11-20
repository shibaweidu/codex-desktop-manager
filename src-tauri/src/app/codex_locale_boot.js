(() => {
  if (window.top !== window || location.protocol !== "app:") return;

  const languageLayer = "72216192";
  const patchedClients = new WeakSet();
  const patchedLayers = new WeakSet();

  function enableLanguage(layer) {
    if (!layer || typeof layer.get !== "function" || patchedLayers.has(layer)) return layer;
    const get = layer.get;
    layer.get = function (key, ...args) {
      if (key === "enable_i18n") return true;
      if (key === "locale_source") return "SYSTEM";
      return get.call(this, key, ...args);
    };
    patchedLayers.add(layer);
    return layer;
  }

  function patchClient(client) {
    if (!client || typeof client !== "object" || patchedClients.has(client)) return;
    patchedClients.add(client);
    for (const method of ["getLayer", "_getLayerImpl", "getDynamicConfig"]) {
      const original = client[method];
      if (typeof original !== "function") continue;
      client[method] = function (name, ...args) {
        const layer = original.call(this, name, ...args);
        return name === languageLayer ? enableLanguage(layer) : layer;
      };
    }
  }

  function patchRoot(root) {
    if (!root) return;
    patchClient(root.firstInstance);
    Object.values(root.instances ?? {}).forEach(patchClient);
  }

  // The SDK publishes its global again when registering a client.
  let statsig = window.__STATSIG__;
  Object.defineProperty(window, "__STATSIG__", {
    configurable: true,
    get: () => statsig,
    set(root) {
      statsig = root;
      patchRoot(root);
    },
  });
  patchRoot(statsig);
  window.__camCodexLocaleBoot = true;
})();
