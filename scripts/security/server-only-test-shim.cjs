const Module = require("node:module");
const path = require("node:path");

const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

Module._resolveFilename = function resolveServerOnlyForNodeTests(request, parent, isMain, options) {
  if (request === "server-only") {
    return path.join(process.cwd(), "node_modules/next/dist/compiled/server-only/empty.js");
  }

  return originalResolveFilename.call(this, request, parent, isMain, options);
};

Module._load = function loadTestOnlySystemSettings(request, parent, isMain) {
  if (request === "@/app/actions/systemSettings" || request.endsWith("/app/actions/systemSettings")) {
    return { getSystemSetting: async () => null };
  }

  return originalLoad.call(this, request, parent, isMain);
};
