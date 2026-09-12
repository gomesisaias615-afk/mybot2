const provedor = String(process.env.WHATSAPP_PROVIDER || "").toLowerCase();
require(["meta", "cloud_api"].includes(provedor) ? "./app.meta" : "./app");

