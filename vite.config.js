import { defineConfig } from "vite";

const privatePreviewHost = process.env.PRIVATE_PREVIEW_HOST;

export default defineConfig({
  preview: {
    host: "127.0.0.1",
    allowedHosts: privatePreviewHost ? [privatePreviewHost] : [],
  },
});
