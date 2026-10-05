require("dotenv").config();
const express = require("express");
const cors = require("cors");

const scrapeRoutes = require("./routes/scrape");
const cafeRoutes = require("./routes/cafes");
const regionRoutes = require("./routes/regions");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/scrape", scrapeRoutes);
app.use("/api/cafes", cafeRoutes);
app.use("/api/regions", regionRoutes);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`CoffAI lead engine backend running on port ${PORT}`));
