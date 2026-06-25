import { parentPort } from "worker_threads";
import { pathToFileURL } from "url";
let pluginInstance = null;
let pluginDir = "";
let registeredTools = [];
let registeredSkills = [];
let registeredHooks = [];
function sendResponse(response) {
  parentPort?.postMessage(response);
}
function sendError(requestId, type, error) {
  sendResponse({
    requestId,
    type,
    success: false,
    error: error instanceof Error ? error.message : String(error)
  });
}
async function handleInit(requestId, pluginPath) {
  try {
    pluginDir = pluginPath;
    const module = await import(pathToFileURL(pluginPath).href);
    const plugin = module.default || module.plugin || module;
    if (!plugin || typeof plugin !== "object") {
      throw new Error("\u63D2\u4EF6\u6A21\u5757\u5FC5\u987B\u5BFC\u51FA\u63D2\u4EF6\u5BF9\u8C61");
    }
    const p = plugin;
    if (!p.name) {
      throw new Error("\u63D2\u4EF6\u5FC5\u987B\u5305\u542B name \u5C5E\u6027");
    }
    pluginInstance = p;
    if (typeof p.register === "function") {
      const sandboxContext = {
        registerTool: (tool) => {
          registeredTools.push(tool);
        },
        registerTools: (tools) => {
          registeredTools.push(...tools);
        },
        getConfig: () => ({})
      };
      await p.register(sandboxContext);
    }
    if (typeof p.getTools === "function") {
      const tools = p.getTools();
      registeredTools = [...registeredTools, ...tools];
    }
    if (typeof p.getSkills === "function") {
      registeredSkills = p.getSkills();
    }
    if (typeof p.getHooks === "function") {
      registeredHooks = p.getHooks();
    }
    sendResponse({
      requestId,
      type: "init",
      success: true,
      data: {
        name: p.name,
        version: p.version || "0.0.0",
        description: p.description || "",
        author: p.author,
        dependencies: p.dependencies,
        tools: registeredTools.map((t) => ({ name: t.name, description: t.description, group: t.group })),
        skills: registeredSkills.map((s) => ({ name: s.name, description: s.description, tags: s.tags })),
        hooks: registeredHooks.map((h) => ({ event: h.event, priority: h.priority }))
      }
    });
  } catch (error) {
    sendError(requestId, "init", error);
  }
}
function handleGetTools(requestId) {
  try {
    const tools = pluginInstance && typeof pluginInstance.getTools === "function" ? pluginInstance.getTools() : registeredTools;
    const serialized = tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      requiresConfirm: t.requiresConfirm,
      group: t.group
    }));
    sendResponse({ requestId, type: "getTools", success: true, data: serialized });
  } catch (error) {
    sendError(requestId, "getTools", error);
  }
}
function handleGetSkills(requestId) {
  try {
    const skills = pluginInstance && typeof pluginInstance.getSkills === "function" ? pluginInstance.getSkills() : registeredSkills;
    sendResponse({ requestId, type: "getSkills", success: true, data: skills });
  } catch (error) {
    sendError(requestId, "getSkills", error);
  }
}
function handleGetHooks(requestId) {
  try {
    const hooks = pluginInstance && typeof pluginInstance.getHooks === "function" ? pluginInstance.getHooks() : registeredHooks;
    const serialized = hooks.map((h) => ({
      event: h.event,
      priority: h.priority
    }));
    sendResponse({ requestId, type: "getHooks", success: true, data: serialized });
  } catch (error) {
    sendError(requestId, "getHooks", error);
  }
}
async function handleExecuteTool(requestId, toolName, params, context) {
  try {
    if (!pluginInstance) {
      throw new Error("\u63D2\u4EF6\u672A\u521D\u59CB\u5316");
    }
    const tools = pluginInstance && typeof pluginInstance.getTools === "function" ? pluginInstance.getTools() : registeredTools;
    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      throw new Error(`\u672A\u627E\u5230\u5DE5\u5177: ${toolName}`);
    }
    if (typeof tool.execute !== "function") {
      throw new Error(`\u5DE5\u5177 ${toolName} \u6CA1\u6709\u5B9E\u73B0 execute \u65B9\u6CD5`);
    }
    const result = await tool.execute(params, context);
    sendResponse({ requestId, type: "executeTool", success: true, data: result });
  } catch (error) {
    sendError(requestId, "executeTool", error);
  }
}
async function handleTriggerHook(requestId, event, context) {
  try {
    if (!pluginInstance) {
      throw new Error("\u63D2\u4EF6\u672A\u521D\u59CB\u5316");
    }
    const hooks = pluginInstance && typeof pluginInstance.getHooks === "function" ? pluginInstance.getHooks() : registeredHooks;
    const matchingHooks = hooks.filter((h) => h.event === event);
    let currentContext = context;
    const sorted = [...matchingHooks].sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
    );
    for (const hook of sorted) {
      if (typeof hook.handler === "function") {
        currentContext = await hook.handler(currentContext);
        if (currentContext?.preventDefault) break;
      }
    }
    sendResponse({ requestId, type: "triggerHook", success: true, data: currentContext });
  } catch (error) {
    sendError(requestId, "triggerHook", error);
  }
}
function handleShutdown(requestId) {
  try {
    if (pluginInstance && typeof pluginInstance.unregister === "function") {
      pluginInstance.unregister();
    }
    pluginInstance = null;
    sendResponse({ requestId, type: "shutdown", success: true });
  } catch (error) {
    sendError(requestId, "shutdown", error);
  }
}
parentPort?.on("message", async (message) => {
  const { type, requestId } = message;
  switch (type) {
    case "init":
      await handleInit(requestId, message.pluginPath);
      break;
    case "getTools":
      handleGetTools(requestId);
      break;
    case "getSkills":
      handleGetSkills(requestId);
      break;
    case "getHooks":
      handleGetHooks(requestId);
      break;
    case "executeTool": {
      const msg = message;
      await handleExecuteTool(requestId, msg.toolName, msg.params, msg.context);
      break;
    }
    case "triggerHook": {
      const msg = message;
      await handleTriggerHook(requestId, msg.event, msg.context);
      break;
    }
    case "shutdown":
      handleShutdown(requestId);
      break;
    default:
      sendError(requestId, type, `\u672A\u77E5\u6D88\u606F\u7C7B\u578B: ${type}`);
  }
});
