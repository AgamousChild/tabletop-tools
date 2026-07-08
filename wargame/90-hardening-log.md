# 90 — Hardening log

> Dated verification passes over the wargame's claims, per the loop protocol
> in [`00-methodology.md`](00-methodology.md). Each entry: what was probed,
> what was found, which doc was corrected.

## 2026-07-06 — Pass 1: local environment probe (live commands, this box)

| Claim (doc) | Probe | Result | Action |
|---|---|---|---|
| Ollama viable local runtime, "verify at adoption" (D01) | `ollama --version` | **0.24.0 installed** ✅ | D01 verified — no correction |
| Ollama `format:<json-schema>` "version-dependent, verify" (D08) | version check | 0.24.0 ≫ 0.5.0 (structured outputs GA) → **supported** ✅ | D08 corrected: J3 available today |
| D02 candidate list complete | `ollama list` | `llama3.1:8b` ✅ (matches `types.ts:86`), `gemma2:9b` ✅ (matches auto-review), **`gemma4:latest` 9.6 GB pulled 13 days ago — a candidate my list missed** | D02 corrected: Gemma 4 added to Tier I/II eval set (already on disk); `latest` tag violates D03 pinning — re-pull by exact tag for the eval |
| 7.5 GB usable VRAM design target; 3 GB degraded state "when Quest link on" (01, D09) | `nvidia-smi` | **2 955 MiB free / 5 003 used right now** — second probe this session, second time contended | D09 corrected: degraded state is the *common* state, not the exception; guard is mandatory, Tier III is the realistic interactive default until link-off is confirmed |
| no-cheat training "pip install ultralytics" just works (no-cheat playbook Phase B) | `python --version`, `pip list` | **Python 3.14.3**; torch/ultralytics **not installed**; torch wheels typically lag newest Python *(est.)* | Playbook corrected: use a pinned 3.11/3.12 venv (uv/py-launcher) for ultralytics |
| ffmpeg on PATH (physics) | `ffmpeg -version` | **8.1.1 full build** ✅ | Verified — no correction |
| ONNX Runtime Web WebGPU EP "verify availability" (D06) | `package.json` | **`onnxruntime-web ^1.24.3`** already a dependency — WebGPU EP present in this line; browser/driver behavior still needs the Phase C runtime check | D06 partially verified: library side ✅, runtime check stands |
| libSQL-native vectors vs sqlite-vec "verify which" (D05) | `packages/db/package.json` | `@libsql/client ^0.14.0`, drizzle 0.38 — client version noted; **vector-function support in local-file mode still unverified** | Open — next hardening pass (needs a live query test) |
| transformers.js/ONNX embed path is a *new* dependency (D04) | grep package.jsons | No `@xenova`/`@huggingface/transformers` anywhere (only tesseract.js in study) ✅ as assumed | Verified — no correction |
| Ollama daemon idle behavior (D09 keep_alive) | `ollama ps` | Nothing resident ✅ | Consistent — no correction |

**Net effect:** the local lane is closer than the docs assumed — runtime
installed, two of three incumbent models pulled, ffmpeg ready, ORT-web already
WebGPU-capable. The two real blockers surfaced: **VRAM contention is chronic**
(plan for Tier III as the daytime default) and **Python 3.14 will likely block
ultralytics** until a pinned older venv is used.

## 2026-07-06 — Pass 2: queue items 1, 2, 6 (interrupted by power outage; results recovered from transcript + libsql test re-run in recovery session)

| Claim (doc) | Probe | Result | Action |
|---|---|---|---|
| libSQL local-file vector functions "verify which flavor" (D05, queue #1) | live `@libsql/client ^0.14.0` script against a local `file:` DB | **All native vector ops work**: `F32_BLOB` column, `vector32()`, `vector_distance_cos()`, `libsql_vector_idx()` index, `vector_top_k()` ANN query ✅ | D05 corrected: S1 = libSQL-native, verified; sqlite-vec not needed |
| Qwen3 registry tag spellings "drift, verify at pull time" (D02/D03, queue #2) | fetched `ollama.com/library/qwen3/tags` | `qwen3:8b-q4_K_M` 5.2 GB, `qwen3:14b-q4_K_M` 9.3 GB, `qwen3:4b-q4_K_M` 2.6 GB — **exactly as the docs spell them**; `q8_0` variants exist (8.9/16/4.4 GB) | D02 corrected: tags marked verified |
| `gemma4:latest` identity unknown (D02 M8, queue #6) | `ollama show gemma4:latest` | **8.0B params, Q4_K_M, 131 072 ctx, Apache 2.0; capabilities: completion + vision + audio + tools + thinking** — Tier I-sized (not ~12B as guessed), and the only multimodal candidate in the roster | D02 corrected: M8 identity pinned; flagged D11 overlap (shared resident multimodal model) |

**Net effect:** the D05 storage question is settled outright — the brain's
local lane can be literally one `.db` file on the existing client, no new
dependency. And Gemma 4 being an 8B with vision+audio makes the D02 eval more
interesting than a pure text bake-off: one resident model could cover both the
text tier and D11's captioning lane.

## 2026-07-06 — Pass 3: Cloud Run pricing + WebGPU attempts (hardening stopped by Micah mid-pass)

| Claim (doc) | Probe | Result | Action |
|---|---|---|---|
| Cloud Run costs order-of-magnitude *(est.)* (D10, queue #2) | fetched live pricing + GPU docs | **L4 $0.0001867/s ≈ $0.67/hr** (no zonal redundancy), vCPU ~$0.086/hr, mem $0.009/GiB-hr; L4 minimum 4 CPU/16 GiB → **≈ $1.16/hr all-in active, $0 idle**; scale-to-zero + ~5 s instance start re-confirmed; no GPU free tier; instance-based billing required | D10 corrected: status header now carries verified rates. "Low-single-$/hr" and "hundreds of $/month always-on" (~$850/mo) claims both hold |
| WebGPU EP initializes in Chrome (D06, queue #1) | real installed Chrome via Playwright `channel:'chrome'`, headless **and headed**, `--enable-unsafe-webgpu` | **`navigator.gpu` absent in both modes** under automation; also absent in Playwright's bundled Chromium 149. Automation flags appear to disable WebGPU entirely — this does **not** answer the interactive-Chrome question | **Inconclusive by automation.** Needs a human check: visit `chrome://gpu` in your normal Chrome and look for "WebGPU: Hardware accelerated". D06 Phase C runtime check stands |
| bge-base parity vs Workers AI (queue #3) | credentials scouted | CF token in root `.env` **valid** (accounts API 200), account id retrieved — REST path to `@cf/baai/bge-base-en-v1.5` is open; local side (transformers.js) not yet installed | **Unblocked but not run** — stopped at Micah's request. This remains the brain playbook's go/no-go gate |

### Still unverified (queue for future passes)

1. WebGPU in *interactive* Chrome on driver 591.86 (D06 Phase C) — automation cannot see it; check `chrome://gpu` manually.
2. bge-base ONNX pooling parity vs Workers AI (brain playbook Phase B — the go/no-go). Creds verified; test script not yet run.
