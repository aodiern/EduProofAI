const http = require("node:http");
const fsSync = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

loadEnvFile();

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const CORPUS_DIR = path.join(ROOT, "corpus");
const STORAGE_DIR = path.join(ROOT, "storage");
const LOCAL_IPFS_DIR = path.join(STORAGE_DIR, "ipfs");
const CHAIN_DIR = path.join(STORAGE_DIR, "chain");
const REGISTRY_FILE = path.join(CHAIN_DIR, "blockchain-registry.json");
const CHAIN_MODE = (process.env.CHAIN_MODE || "truffle").toLowerCase();
const TRUFFLE_PROJECT_DIR = path.resolve(ROOT, process.env.TRUFFLE_PROJECT_DIR || ".");
const TRUFFLE_NETWORK = process.env.TRUFFLE_NETWORK || "development";
const ETH_RPC_URL = process.env.ETH_RPC_URL || "http://127.0.0.1:7545";
const AI_PROVIDER = (process.env.AI_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "ollama")).toLowerCase();
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "http://localhost:11434").replace(/\/$/, "");
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const MAX_TEXT_LENGTH = 18000;
const SHINGLE_SIZE = 5;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "POST" && url.pathname === "/api/analyze-work") {
      await handleAnalyze(req, res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/mint-certificate") {
      await handleMint(req, res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      sendJson(res, 200, {
        ok: true,
        ai: {
          provider: AI_PROVIDER,
          model: getProviderModel(),
        },
        chain: await getChainDiagnostics(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/registry") {
      sendJson(res, 200, {
        ok: true,
        registry: await loadBlockchainRegistry(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/corpus") {
      const sources = await loadCorpus();
      sendJson(res, 200, {
        ok: true,
        count: sources.length,
        sources: sources.map(({ id, title, type, url }) => ({ id, title, type, url })),
      });
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { ok: false, error: "Method not allowed" });
      return;
    }

    await serveStatic(url.pathname, res, req.method === "HEAD");
  } catch (error) {
    sendJson(res, 500, { ok: false, error: error.message || "Server error" });
  }
});

server.listen(PORT, () => {
  console.log(`EduProof AI server: http://localhost:${PORT}`);
  console.log(`AI provider: ${AI_PROVIDER}`);
  console.log(`AI model: ${getProviderModel()}`);
  console.log(`Plagiarism corpus: ${CORPUS_DIR}`);
  console.log(`Chain mode: ${CHAIN_MODE}`);
});

async function handleAnalyze(req, res) {
  const body = await readJsonBody(req);
  const text = String(body.text || "").trim();
  const strictness = clampInt(body.strictness, 1, 5);
  const title = String(body.title || "Без названия").slice(0, 240);
  const workType = String(body.workType || "Учебная работа").slice(0, 120);

  if (text.length < 120) {
    sendJson(res, 400, { ok: false, error: "Text is too short for analysis." });
    return;
  }

  const checkedText = text.slice(0, MAX_TEXT_LENGTH);
  const plagiarism = await checkPlagiarism(checkedText);
  let rawAnalysis;
  let provider = AI_PROVIDER;
  let model = getProviderModel();

  try {
    rawAnalysis = await callNeuralReviewer({
      text: checkedText,
      strictness,
      title,
      workType,
      plagiarism,
    });
  } catch (error) {
    provider = "local";
    model = "plagiarism+heuristic";
    rawAnalysis = buildLocalAnalysis({
      text: checkedText,
      strictness,
      plagiarism,
      cause: error,
    });
  }

  const normalizedAnalysis = normalizeAnalysis(rawAnalysis, plagiarism);
  const workHash = sha256Hex(checkedText);
  const reportHash = sha256Hex(JSON.stringify(normalizedAnalysis));
  const metadata = await persistToLocalIpfs({
    kind: "EduProofAIReview",
    title,
    workType,
    provider,
    model,
    workHash,
    reportHash,
    analysis: normalizedAnalysis,
    createdAt: new Date().toISOString(),
  });

  sendJson(res, 200, {
    ok: true,
    provider,
    model,
    workHash,
    reportHash,
    metadata,
    pipeline: ["Browser", "Backend API", "AI model", "IPFS metadata"],
    analysis: normalizedAnalysis,
  });
}

async function handleMint(req, res) {
  const body = await readJsonBody(req);
  const certificate = body.certificate || body;
  const score = clampInt(certificate.score, 0, 100);

  if (score < 70) {
    sendJson(res, 400, { ok: false, error: "Certificate score is below mint threshold." });
    return;
  }

  if (!certificate.workHash || !certificate.reportHash || !certificate.metadataURI) {
    sendJson(res, 400, { ok: false, error: "workHash, reportHash and metadataURI are required." });
    return;
  }

  const registry = await loadBlockchainRegistry();
  const tokenId = certificate.tokenId || nextTokenId(registry.length + 1);
  const blockNumber = 100000 + registry.length + 1;
  const issuedAt = new Date().toISOString();
  const txPayload = {
    tokenId,
    author: certificate.author || "Unknown",
    title: certificate.title || "Untitled",
    score,
    workHash: certificate.workHash,
    reportHash: certificate.reportHash,
    metadataURI: certificate.metadataURI,
    issuer: certificate.institution || "EduProof AI issuer",
    submittedByRole: certificate.submittedByRole || null,
    submittedByRoleTitle: certificate.submittedByRoleTitle || null,
    issuedByRole: certificate.issuedByRole || "issuer",
    issuedByRoleTitle: certificate.issuedByRoleTitle || "Преподаватель / issuer",
    issuedAt,
    blockNumber,
  };
  const chainRecord = await mintCertificateOnChain(txPayload).catch((error) => ({
    ...txPayload,
    transactionHash: sha256Hex(JSON.stringify(txPayload)),
    network: "Local EduProof Chain",
    contractAddress: "0xEduProofCertificateLocal000000000000000001",
    status: "active",
    fallbackReason: error.message || "Real smart contract mint failed.",
  }));

  registry.unshift(chainRecord);
  await saveBlockchainRegistry(registry);

  sendJson(res, 200, {
    ok: true,
    minted: chainRecord,
    pipeline: [chainRecord.network === "Local EduProof Chain" ? "Smart Contract fallback" : "Smart Contract", "Blockchain Registry"],
  });
}

async function mintCertificateOnChain(txPayload) {
  if (CHAIN_MODE !== "truffle") {
    throw new Error(`CHAIN_MODE=${CHAIN_MODE}, real Truffle mint is disabled.`);
  }

  await assertGanacheAvailable();
  const artifact = await loadTruffleArtifact();
  const contractAddress = getLatestArtifactAddress(artifact);
  if (!contractAddress) {
    throw new Error("EduProofCertificate is not deployed. Run: npx truffle migrate --reset --network development");
  }

  await fs.mkdir(CHAIN_DIR, { recursive: true });
  const payloadPath = path.join(CHAIN_DIR, `mint-payload-${Date.now()}-${crypto.randomBytes(3).toString("hex")}.json`);
  await fs.writeFile(payloadPath, JSON.stringify(txPayload, null, 2), "utf8");

  try {
    const result = await runTruffleMint(payloadPath);
    return {
      ...txPayload,
      tokenId: result.tokenId || txPayload.tokenId,
      transactionHash: result.transactionHash,
      network: `Ganache (${TRUFFLE_NETWORK})`,
      networkId: result.networkId,
      blockNumber: result.blockNumber || txPayload.blockNumber,
      contractAddress: result.contractAddress || contractAddress,
      status: "active",
    };
  } finally {
    await fs.unlink(payloadPath).catch(() => {});
  }
}

async function assertGanacheAvailable() {
  let response;
  try {
    response = await fetchWithTimeout(ETH_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "eth_accounts", params: [], id: 1 }),
    }, 1600);
  } catch {
    throw new Error(`Ganache JSON-RPC is not available at ${ETH_RPC_URL}. Start Ganache on 127.0.0.1:7545.`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(`Ganache JSON-RPC is not available at ${ETH_RPC_URL}.`);
  }
}

async function loadTruffleArtifact() {
  const artifactPath = path.join(TRUFFLE_PROJECT_DIR, "build", "contracts", "EduProofCertificate.json");
  return JSON.parse(await fs.readFile(artifactPath, "utf8"));
}

function getLatestArtifactAddress(artifact) {
  const networks = Object.values(artifact.networks || {});
  return networks.at(-1)?.address || "";
}

async function getChainDiagnostics() {
  const diagnostics = {
    mode: CHAIN_MODE,
    network: TRUFFLE_NETWORK,
    rpc: ETH_RPC_URL,
    ganache: {
      online: false,
      clientVersion: "",
      accountCount: 0,
      error: "",
    },
    contract: {
      name: "EduProofCertificate",
      artifact: false,
      deployed: false,
      address: "",
      error: "",
    },
  };

  try {
    const artifact = await loadTruffleArtifact();
    diagnostics.contract.artifact = true;
    diagnostics.contract.address = getLatestArtifactAddress(artifact);
    diagnostics.contract.deployed = Boolean(diagnostics.contract.address);
  } catch (error) {
    diagnostics.contract.error = error.message || "Contract artifact is not available.";
  }

  try {
    const [clientVersion, accounts] = await Promise.all([
      callRpc("web3_clientVersion", [], 900),
      callRpc("eth_accounts", [], 900),
    ]);
    diagnostics.ganache.online = true;
    diagnostics.ganache.clientVersion = typeof clientVersion === "string" ? clientVersion : "JSON-RPC online";
    diagnostics.ganache.accountCount = Array.isArray(accounts) ? accounts.length : 0;
  } catch (error) {
    diagnostics.ganache.error = error.message || `Ganache JSON-RPC is not available at ${ETH_RPC_URL}.`;
  }

  return diagnostics;
}

async function callRpc(method, params = [], timeoutMs = 1200) {
  const response = await fetchWithTimeout(ETH_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: Date.now() }),
  }, timeoutMs);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.error) {
    throw new Error(payload.error?.message || `RPC ${method} failed.`);
  }
  return payload.result;
}

function runTruffleMint(payloadPath) {
  const scriptPath = path.join(ROOT, "tools", "truffle-mint-eduproof.js");
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = ["truffle", "exec", scriptPath, "--network", TRUFFLE_NETWORK];

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: TRUFFLE_PROJECT_DIR,
      env: {
        ...process.env,
        EDUPROOF_MINT_PAYLOAD: payloadPath,
      },
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Truffle mint timed out. Check Ganache and migrations."));
    }, 30000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(stderr || stdout || `Truffle mint exited with code ${code}.`));
        return;
      }

      const line = stdout
        .split(/\r?\n/)
        .find((item) => item.startsWith("EDUPROOF_MINT_RESULT "));
      if (!line) {
        reject(new Error(`Truffle mint did not return a result. ${stdout || stderr}`));
        return;
      }

      resolve(JSON.parse(line.replace("EDUPROOF_MINT_RESULT ", "")));
    });
  });
}

async function callNeuralReviewer({ text, strictness, title, workType, plagiarism }) {
  if (AI_PROVIDER === "ollama") {
    return callOllamaReviewer({ text, strictness, title, workType, plagiarism });
  }

  if (AI_PROVIDER === "openai") {
    return callOpenAiReviewer({ text, strictness, title, workType, plagiarism });
  }

  throw new Error(`Unknown AI_PROVIDER "${AI_PROVIDER}". Use "ollama" or "openai".`);
}

async function callOllamaReviewer({ text, strictness, title, workType, plagiarism }) {
  let response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        format: "json",
        options: { temperature: 0.1 },
        messages: buildReviewMessages({ text, strictness, title, workType, plagiarism }),
      }),
    });
  } catch {
    throw new Error(`Cannot connect to Ollama at ${OLLAMA_BASE_URL}. Start Ollama and run: ollama pull ${OLLAMA_MODEL}`);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Ollama returned HTTP ${response.status}. Check that model "${OLLAMA_MODEL}" is pulled.`);
  }

  const content = payload.message?.content || payload.response;
  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }

  return extractJson(content);
}

async function callOpenAiReviewer({ text, strictness, title, workType, plagiarism }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured. Set it or use AI_PROVIDER=ollama.");
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: buildReviewMessages({ text, strictness, title, workType, plagiarism }),
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `AI provider returned HTTP ${response.status}`);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI provider returned an empty response.");
  }

  return extractJson(content);
}

function buildReviewMessages({ text, strictness, title, workType, plagiarism }) {
  const topMatches = plagiarism.matches
    .slice(0, 3)
    .map((match, index) => `${index + 1}. ${match.title}: ${match.similarity}% совпадений, пример: ${match.excerpt}`)
    .join("\n");

  return [
    {
      role: "system",
      content:
        "Ты академический AI-рецензент EduProof AI. Оцени учебную работу по оригинальности, авторскому стилю и академической структуре. Учитывай локальный отчет антиплагиата. Отвечай только валидным JSON без Markdown.",
    },
    {
      role: "user",
      content: [
        `Название: ${title}`,
        `Тип работы: ${workType}`,
        `Строгость проверки от 1 до 5: ${strictness}`,
        "",
        "Локальный антиплагиат:",
        `- проверено источников: ${plagiarism.checkedSources}`,
        `- процент совпадений: ${plagiarism.similarity}%`,
        `- уникальность: ${plagiarism.uniquePercent}%`,
        `- статус: ${plagiarism.status}`,
        topMatches || "- существенных совпадений не найдено",
        "",
        "Верни JSON с полями:",
        "overall, originality, authorship, structure - целые числа 0..100;",
        "risk - одна из строк: Низкий риск, Средний риск, Требуется доработка;",
        "summary - 1-2 предложения по-русски;",
        "recommendations - массив из 2-4 коротких рекомендаций;",
        "flags - массив из 0-4 найденных рисков;",
        "words, references, repeatedSentenceCount, suspiciousMarkers - целые числа.",
        "",
        "Текст работы:",
        text,
      ].join("\n"),
    },
  ];
}

async function checkPlagiarism(text) {
  const sources = await loadCorpus();
  const inputTokens = tokenize(text);
  const inputShingles = makeShingles(inputTokens, SHINGLE_SIZE);
  const inputSentences = splitSentences(text);

  const matches = sources
    .map((source) => matchSource(text, inputShingles, inputSentences, source))
    .filter((match) => match.similarity >= 3 || match.matchedSentences.length > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 6);

  const topSimilarity = matches[0]?.similarity || 0;
  const accumulatedSimilarity = matches.reduce((sum, match, index) => sum + match.similarity / (index + 2), 0);
  const similarity = clampInt(Math.max(topSimilarity, accumulatedSimilarity), 0, 100);
  const uniquePercent = clampInt(100 - similarity, 0, 100);

  return {
    method: `word ${SHINGLE_SIZE}-shingles + sentence containment`,
    checkedSources: sources.length,
    similarity,
    uniquePercent,
    status: similarity >= 35 ? "Высокий риск совпадений" : similarity >= 15 ? "Средний риск совпадений" : "Низкий риск совпадений",
    matches,
  };
}

function matchSource(inputText, inputShingles, inputSentences, source) {
  const sourceTokens = tokenize(source.text);
  const sourceShingles = makeShingles(sourceTokens, SHINGLE_SIZE);
  const sourceSet = new Set(sourceShingles);
  let overlap = 0;

  for (const shingle of inputShingles) {
    if (sourceSet.has(shingle)) overlap += 1;
  }

  const containment = inputShingles.length ? overlap / inputShingles.length : 0;
  const matchedSentences = inputSentences
    .map((sentence) => matchSentence(sentence, sourceSet))
    .filter(Boolean)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 4);

  const matchedChars = matchedSentences.reduce((sum, item) => sum + item.text.length, 0);
  const charShare = inputText.length ? matchedChars / inputText.length : 0;
  const similarity = clampInt(Math.max(containment, charShare) * 100, 0, 100);

  return {
    id: source.id,
    title: source.title,
    type: source.type,
    url: source.url,
    similarity,
    overlapShingles: overlap,
    excerpt: matchedSentences[0]?.text || source.text.slice(0, 220),
    matchedSentences,
  };
}

function matchSentence(sentence, sourceSet) {
  const tokens = tokenize(sentence);
  if (tokens.length < SHINGLE_SIZE * 2) return null;

  const shingles = makeShingles(tokens, SHINGLE_SIZE);
  if (!shingles.length) return null;

  let overlap = 0;
  for (const shingle of shingles) {
    if (sourceSet.has(shingle)) overlap += 1;
  }

  const similarity = overlap / shingles.length;
  if (similarity < 0.45) return null;

  return {
    text: sentence.slice(0, 260),
    similarity: clampInt(similarity * 100, 0, 100),
  };
}

function buildLocalAnalysis({ text, strictness, plagiarism, cause }) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/).filter(Boolean);
  const unique = new Set(words);
  const sentences = splitSentences(text);
  const repeatedSentenceCount = sentences.length - new Set(sentences.map(normalizeText)).size;
  const references = (text.match(/источник|литератур|reference|doi|http|ipfs|blockchain|смарт|статья|исследован/gi) || []).length;
  const structureMarkers = (text.match(/архитектур|экономик|roadmap|этап|контракт|интерфейс|модель|токен|валидац/gi) || []).length;
  const suspiciousMarkers = (text.match(/как языковая модель|не могу выполнить|lorem ipsum|chatgpt/gi) || []).length;
  const uniqueRatio = words.length ? unique.size / words.length : 0;

  const lexicalOriginality = clampInt(50 + uniqueRatio * 40 + references * 1.5 - repeatedSentenceCount * 7 - suspiciousMarkers * 14 - strictness, 0, 100);
  const originality = clampInt(Math.min(lexicalOriginality, plagiarism.uniquePercent + 4), 0, 100);
  const authorship = clampInt(52 + Math.min(words.length / 8, 28) + Math.min(sentences.length, 18) - repeatedSentenceCount * 6 - suspiciousMarkers * 10, 0, 100);
  const structure = clampInt(44 + structureMarkers * 4.8 + references * 2 + Math.min(words.length / 22, 24) - strictness, 0, 100);
  const overall = clampInt(originality * 0.42 + authorship * 0.28 + structure * 0.3, 0, 100);

  return {
    overall,
    originality,
    authorship,
    structure,
    words: words.length,
    references,
    repeatedSentenceCount,
    suspiciousMarkers,
    risk: riskFromScores(overall, plagiarism.similarity),
    summary:
      "Сервер выполнил локальную проверку совпадений по корпусу и резервную академическую оценку. Нейросетевая модель не использована: " +
      (cause?.message || "провайдер недоступен."),
    recommendations: buildRecommendations(plagiarism, structure, references),
    flags: buildFlags(plagiarism, repeatedSentenceCount, suspiciousMarkers),
  };
}

function normalizeAnalysis(analysis, plagiarism) {
  const rawOriginality = clampInt(analysis.originality, 0, 100);
  const originality = clampInt(Math.min(rawOriginality, plagiarism.uniquePercent + 4), 0, 100);
  const authorship = clampInt(analysis.authorship, 0, 100);
  const structure = clampInt(analysis.structure, 0, 100);
  const overall = clampInt(originality * 0.42 + authorship * 0.28 + structure * 0.3, 0, 100);

  return {
    overall,
    originality,
    authorship,
    structure,
    risk: riskFromScores(overall, plagiarism.similarity, analysis.risk),
    summary: String(analysis.summary || "Отчет сформирован по академическим критериям.").slice(0, 700),
    recommendations: normalizeList(analysis.recommendations),
    flags: normalizeList(analysis.flags),
    words: clampInt(analysis.words, 0, 100000),
    references: clampInt(analysis.references, 0, 1000),
    repeatedSentenceCount: clampInt(analysis.repeatedSentenceCount, 0, 1000),
    suspiciousMarkers: clampInt(analysis.suspiciousMarkers, 0, 1000),
    plagiarism,
  };
}

async function loadCorpus() {
  const files = await fs.readdir(CORPUS_DIR).catch(() => []);
  const sources = [];

  for (const fileName of files) {
    const filePath = path.join(CORPUS_DIR, fileName);
    const ext = path.extname(fileName).toLowerCase();
    const content = await fs.readFile(filePath, "utf8").catch(() => "");

    if (ext === ".json") {
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed) ? parsed : parsed.sources || [];
      for (const item of items) {
        if (item?.text) sources.push(normalizeSource(item, fileName));
      }
    }

    if (ext === ".txt" && content.trim()) {
      sources.push(
        normalizeSource(
          {
            id: path.basename(fileName, ext),
            title: path.basename(fileName, ext),
            type: "local text",
            text: content,
          },
          fileName,
        ),
      );
    }
  }

  return sources;
}

function normalizeSource(source, fileName) {
  return {
    id: String(source.id || fileName),
    title: String(source.title || source.id || fileName),
    type: String(source.type || "local source"),
    url: String(source.url || "local corpus"),
    text: String(source.text || ""),
  };
}

async function persistToLocalIpfs(metadata) {
  await fs.mkdir(LOCAL_IPFS_DIR, { recursive: true });
  const cid = `bafyeduproof${sha256Hex(JSON.stringify(metadata)).slice(2, 34)}`;
  const fileName = `${cid}.json`;
  const filePath = path.join(LOCAL_IPFS_DIR, fileName);
  const metadataWithCid = {
    ...metadata,
    cid,
    uri: `ipfs://${cid}`,
    gatewayURL: `/storage/ipfs/${fileName}`,
  };

  await fs.writeFile(filePath, JSON.stringify(metadataWithCid, null, 2), "utf8");

  return {
    cid,
    uri: metadataWithCid.uri,
    gatewayURL: metadataWithCid.gatewayURL,
  };
}

async function loadBlockchainRegistry() {
  const raw = await fs.readFile(REGISTRY_FILE, "utf8").catch(() => "[]");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveBlockchainRegistry(registry) {
  await fs.mkdir(CHAIN_DIR, { recursive: true });
  await fs.writeFile(REGISTRY_FILE, JSON.stringify(registry, null, 2), "utf8");
}

function nextTokenId(next) {
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `EDP-${String(next).padStart(4, "0")}-${suffix}`;
}

function sha256Hex(value) {
  return `0x${crypto.createHash("sha256").update(String(value)).digest("hex")}`;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function serveStatic(pathname, res, headOnly) {
  const cleanPath = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html";
  const filePath = path.resolve(ROOT, cleanPath);
  const relativePath = path.relative(ROOT, filePath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    sendJson(res, 403, { ok: false, error: "Forbidden" });
    return;
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || stat.isDirectory()) {
    sendJson(res, 404, { ok: false, error: "Not found" });
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });

  res.end(headOnly ? undefined : await fs.readFile(filePath));
}

function tokenize(text) {
  return normalizeText(text).split(/\s+/).filter((word) => word.length > 2);
}

function normalizeText(text) {
  return String(text)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^а-яa-z0-9\s.?!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  return String(text)
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 70);
}

function makeShingles(tokens, size) {
  if (tokens.length < size) return [];
  const shingles = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    shingles.push(tokens.slice(index, index + size).join(" "));
  }
  return shingles;
}

function extractJson(content) {
  const trimmed = String(content).trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI response does not contain JSON.");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function riskFromScores(overall, plagiarismSimilarity, modelRisk) {
  if (plagiarismSimilarity >= 35 || overall < 70) return "Требуется доработка";
  if (plagiarismSimilarity >= 15 || overall < 85) return "Средний риск";
  if (["Низкий риск", "Средний риск", "Требуется доработка"].includes(modelRisk)) return modelRisk;
  return "Низкий риск";
}

function buildRecommendations(plagiarism, structure, references) {
  const recommendations = [];
  if (plagiarism.similarity >= 15) {
    recommendations.push("Переписать совпадающие фрагменты своими словами и добавить корректные ссылки на источники.");
  }
  if (structure < 75) {
    recommendations.push("Усилить структуру: отдельно описать архитектуру, экономику токена, roadmap и ограничения MVP.");
  }
  if (references < 2) {
    recommendations.push("Добавить список источников, стандарты или ссылки на документацию используемых технологий.");
  }
  recommendations.push("После доработки повторить проверку и выпустить сертификат только при приемлемом уровне совпадений.");
  return recommendations.slice(0, 4);
}

function buildFlags(plagiarism, repeatedSentenceCount, suspiciousMarkers) {
  const flags = [];
  if (plagiarism.similarity >= 35) flags.push("Высокая доля совпадений с локальным корпусом.");
  if (plagiarism.similarity >= 15 && plagiarism.similarity < 35) flags.push("Есть заметные совпадения с локальным корпусом.");
  if (repeatedSentenceCount > 0) flags.push("Найдены повторяющиеся предложения.");
  if (suspiciousMarkers > 0) flags.push("Найдены маркеры машинного шаблона.");
  return flags.length ? flags : ["Критических рисков не найдено."];
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 5);
}

function getProviderModel() {
  if (AI_PROVIDER === "ollama") return OLLAMA_MODEL;
  if (AI_PROVIDER === "openai") return OPENAI_MODEL;
  return "local heuristic";
}

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fsSync.existsSync(envPath)) return;

  const content = fsSync.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const equalsAt = trimmed.indexOf("=");
    if (equalsAt === -1) continue;

    const key = trimmed.slice(0, equalsAt).trim();
    let value = trimmed.slice(equalsAt + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function clampInt(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.round(Math.min(max, Math.max(min, number)));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 240000) {
        req.destroy();
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
