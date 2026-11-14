// Explicitly opt-in UI test harness. Not imported by application routes or build.
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authFixture } from "./helpers/auth-fixture.js";
import { createAuthRouter } from "../src/modules/auth/auth.routes.js";
import { errors } from "../src/middlewares/errors.js";
import { addUiRoleFixtures } from "./helpers/ui-role-fixtures.js";
if (process.env.DND_AUTH_TEST_PREVIEW !== "1")
  throw new Error("Test preview is disabled");
const f = await authFixture(),
  app = express();
addUiRoleFixtures(f);
const origins = ["http://127.0.0.1:5183", "http://127.0.0.1:8083"];
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(
  "/api/auth",
  createAuthRouter(() => f.service, origins),
);
app.use(errors);
app.listen(4399, "127.0.0.1", () =>
  console.log(
    "Isolated authentication UI test harness ready on loopback. No MySQL or production account.",
  ),
);
