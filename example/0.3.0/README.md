# 0.3.0 design notes — honest history, not a roadmap

These are working design records from the 0.3.0/0.4.0 planning, kept because the journey is part
of the truth. Read them as *what we were thinking*, not *what the product does*.

- **[`NULL-PRODUCT-PRD.md`](NULL-PRODUCT-PRD.md)** — the throughput-only floor the quality arms had
  to beat. This is essentially **what 0.3.0 shipped**.
- **[`EXCHANGE-LAW.md`](EXCHANGE-LAW.md)** — the "chat guard" spec. **Shipped** as `lib/exchange.mjs`.
- **[`FLAWS.md`](FLAWS.md)** — the flaw register (A–E) that turned into the R1–R8 reliability fixes.
- **[`DUEL-REPORT-SPEC.md`](DUEL-REPORT-SPEC.md)** and **[`AMBIENT-UX.md`](AMBIENT-UX.md)** — the design
  of the **0.4.0 machinery the [paper-kill](../paper-kill/) killed.** Kept as design history. The
  duel, the court, the ambient trigger — none of it was built, and none of it ships. If the quality
  thesis is ever re-opened, it's a new experiment, not a resumed plan.

The story of why the ambitious half of this folder is unbuilt is in
[`../../THESIS.md`](../../THESIS.md) and [`../paper-kill/`](../paper-kill/).
