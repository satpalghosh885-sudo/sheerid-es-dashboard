import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

test("shared storage, authentication, authorization, scoring and revocation", async () => {
  const dir = mkdtempSync(join(tmpdir(), "sheer-test-")),
    password = randomBytes(24).toString("hex");
  const base = "http://127.0.0.1:3197";
  let proc;
  const start = () => {
    proc = spawn(process.execPath, ["server.mjs"], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: "3197",
        PUBLIC_ORIGIN: base,
        DATABASE_PATH: join(dir, "test.sqlite"),
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_PASSWORD: password,
      },
      stdio: "ignore",
    });
  };
  const wait = async () => {
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(base + "/healthz")).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 50));
    }
    throw Error("Server failed to start");
  };
  async function req(path, method = "GET", body, cookie, origin = base) {
    const res = await fetch(base + "/api" + path, {
      method,
      headers: {
        Origin: origin,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: res.status,
      data: await res.json(),
      cookie: res.headers.get("set-cookie")?.split(";")[0],
      setCookie: res.headers.get("set-cookie"),
    };
  }
  start();
  try {
    await wait();
    assert.equal((await req("/state")).status, 401);
    assert.equal(
      (
        await req(
          "/login",
          "POST",
          { email: "admin@example.com", password },
          null,
          "https://evil.example",
        )
      ).status,
      403,
    );
    const admin = await req("/login", "POST", {
      email: "admin@example.com",
      password,
    });
    assert.equal(admin.status, 200);
    assert.match(admin.setCookie, /HttpOnly/);
    assert.match(admin.setCookie, /Secure/);
    assert.match(admin.setCookie, /SameSite=Strict/);
    let a = admin.cookie;
    for (const [name, role] of [
      ["Agent", "Operator"],
      ["QA", "QC Reviewer"],
    ])
      assert.equal(
        (
          await req(
            "/users",
            "POST",
            {
              name,
              email: name.toLowerCase() + "@example.com",
              role,
              password,
            },
            a,
          )
        ).status,
        201,
      );
    const op = (
        await req("/login", "POST", { email: "agent@example.com", password })
      ).cookie,
      qa = (await req("/login", "POST", { email: "qa@example.com", password }))
        .cookie;
    assert.equal((await req("/settings", "PUT", { best: 1 }, op)).status, 403);
    assert.equal((await req("/users", "POST", {}, op)).status, 403);
    assert.equal((await req("/reviews", "POST", {}, op)).status, 403);
    const before = Date.now();
    assert.equal(
      (
        await req(
          "/tickets",
          "POST",
          { id: "T-1", client: "Spotify", start: 1, operator: "Admin" },
          op,
        )
      ).status,
      201,
    );
    assert.equal(
      (await req("/tickets", "POST", { id: "t-1", client: "Spotify" }, op))
        .status,
      409,
    );
    let state = (await req("/state", "GET", null, op)).data;
    assert.equal(state.users.length, 1);
    assert.equal(state.tickets[0].user_id, state.user.id);
    assert.ok(state.tickets[0].start >= before);
    assert.equal(state.tickets[0].stop, null);
    assert.equal(
      (await req("/tickets/T-1", "PATCH", { status: "Solved" }, qa)).status,
      403,
    );
    assert.equal(
      (await req("/tickets/T-1", "PATCH", { status: "Solved" }, op)).status,
      200,
    );
    assert.equal(
      (
        await req(
          "/reviews",
          "POST",
          {
            ticket: "T-1",
            ratings: Array(13).fill(5),
            score: 0,
            reviewer: "spoof",
          },
          qa,
        )
      ).status,
      201,
    );
    state = (await req("/state", "GET", null, a)).data;
    assert.equal(state.reviews[0].score, 100);
    assert.equal(state.reviews[0].reviewer, "QA");
    assert.ok(state.tickets[0].stop >= state.tickets[0].start);
    const settings = {
      best: 7,
      shift: 420,
      hourly: 10,
      weights: Array(13).fill(0),
    };
    assert.equal((await req("/settings", "PUT", settings, a)).status, 400);
    settings.weights[0] = 100;
    assert.equal((await req("/settings", "PUT", settings, a)).status, 200);
    const agent = state.users.find((u) => u.role === "Operator");
    assert.equal(
      (await req("/users/" + agent.id, "PATCH", { active: false }, a)).status,
      200,
    );
    assert.equal((await req("/state", "GET", null, op)).status, 401);
    assert.equal(
      (await req("/users/" + state.user.id, "PATCH", { active: false }, a))
        .status,
      400,
    );
    assert.ok((await req("/audit", "GET", null, a)).data.length >= 6);
    await new Promise((resolve) => {
      proc.once("exit", resolve);
      proc.kill();
    });
    start();
    await wait();
    state = (await req("/state", "GET", null, a)).data;
    assert.equal(state.tickets.length, 1);
    assert.equal(state.reviews.length, 1);
    const reviewId = state.reviews[0].id;
    assert.equal(
      (
        await req(
          "/reviews/delete-selected",
          "POST",
          { ids: [reviewId], confirmation: "DELETE SELECTED QC REVIEWS" },
          qa,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/tickets/delete-selected",
          "POST",
          { ids: ["T-1"], confirmation: "DELETE SELECTED TICKETS" },
          qa,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await req(
          "/reviews/delete-selected",
          "POST",
          { ids: [reviewId], confirmation: "wrong" },
          a,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await req(
          "/tickets/delete-selected",
          "POST",
          { ids: ["T-1", "missing"], confirmation: "DELETE SELECTED TICKETS" },
          a,
        )
      ).status,
      409,
    );
    assert.equal((await req("/state", "GET", null, a)).data.tickets.length, 1);
    assert.equal(
      (
        await req(
          "/reviews/delete-selected",
          "POST",
          { ids: [reviewId], confirmation: "DELETE SELECTED QC REVIEWS" },
          a,
        )
      ).status,
      200,
    );
    state = (await req("/state", "GET", null, a)).data;
    assert.equal(state.reviews.length, 0);
    assert.equal(state.tickets.length, 1);
    await req("/tickets", "POST", { id: "KEEP-2", client: "Adobe" }, a);
    await req("/tickets/KEEP-2", "PATCH", { status: "Solved" }, a);
    for (const ticket of ["T-1", "KEEP-2"])
      await req("/reviews", "POST", { ticket, ratings: Array(13).fill(5) }, a);
    assert.equal(
      (
        await req(
          "/tickets/delete-selected",
          "POST",
          { ids: [], confirmation: "DELETE SELECTED TICKETS" },
          a,
        )
      ).status,
      400,
    );
    const deleted = await req(
      "/tickets/delete-selected",
      "POST",
      { ids: ["T-1"], confirmation: "DELETE SELECTED TICKETS" },
      a,
    );
    assert.equal(deleted.status, 200);
    assert.equal(deleted.data.linkedReviews, 1);
    state = (await req("/state", "GET", null, a)).data;
    assert.deepEqual(
      state.tickets.map((t) => t.id),
      ["KEEP-2"],
    );
    assert.equal(state.reviews.length, 1);
    assert.equal(state.reviews[0].ticket, "KEEP-2");
    assert.equal(state.users.length, 3);
    assert.equal(state.settings.weights[0], 100);
    const events = (await req("/audit", "GET", null, a)).data;
    assert.ok(
      events.some((e) => e.action === "ticket_deleted" && e.target === "T-1"),
    );
    assert.ok(
      events.some(
        (e) => e.action === "review_deleted" && e.target === String(reviewId),
      ),
    );
    assert.equal(
      (
        await req(
          "/users/" + agent.id + "/password",
          "POST",
          { password: randomBytes(24).toString("hex") },
          a,
        )
      ).status,
      200,
    );
    assert.equal((await req("/logout", "POST", {}, a)).status, 200);
    assert.equal((await req("/state", "GET", null, a)).status, 401);
  } finally {
    await new Promise((resolve) => {
      if (proc.exitCode !== null) return resolve();
      proc.once("exit", resolve);
      proc.kill();
    });
    rmSync(dir, { recursive: true, force: true });
  }
});
