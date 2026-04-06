import { createWebSearchTool, createCodeSearchTool, createFetchContentTool } from "./tools.js";
export default function (pi) {
    pi.registerTool(createWebSearchTool());
    pi.registerTool(createCodeSearchTool());
    pi.registerTool(createFetchContentTool());
}
