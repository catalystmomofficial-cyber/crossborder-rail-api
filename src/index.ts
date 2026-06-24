import express, { Express, Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import payoutRouter from "./routes/payout";

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/v1/payout", payoutRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ status: "error", message: "Not found" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ status: "error", message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Cross-border rail API listening on port ${PORT}`);
});
