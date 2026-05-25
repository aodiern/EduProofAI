const STORAGE_KEY = "eduproof.registry.v1";
const BALANCE_KEY = "eduproof.balance.v1";
const DEFAULT_BALANCE = 1240;
const BASE_FEE = 18;
const BURN_RATE = 0.35;
const VALIDATOR_RATE = 0.4;
const TREASURY_RATE = 0.25;

const sampleText = `EduProof AI предлагает децентрализованную платформу проверки учебных работ. Студент загружает текст, система строит AI-отчет об оригинальности, академической структуре и авторском стиле, после чего в блокчейн записывается хеш работы и выпускается непередаваемый NFT-сертификат.

Проект отличается от централизованных сервисов тем, что результат проверки можно независимо подтвердить: вуз, работодатель или грантовая комиссия вводит Token ID и видит статус сертификата без доступа к закрытому тексту работы. Экономика EDP связывает оплату проверки, сжигание комиссии, вознаграждение валидаторов и развитие AI-моделей.

Архитектура включает клиентский интерфейс, AI API, IPFS-хранилище metadata и смарт-контракт EduProofCertificate. На первом этапе реализуется MVP, далее добавляются кошелек, тестовая сеть Polygon Amoy, backend для DOCX/PDF и пилот с кафедрой.`;

const state = {
  registry: loadRegistry(),
  balance: loadBalance(),
  pendingCertificate: null,
  lastReport: null,
};

const els = {
  tabs: document.querySelectorAll(".nav-tab"),
  panels: document.querySelectorAll(".tab-panel"),
  workForm: document.querySelector("#workForm"),
  workText: document.querySelector("#workText"),
  loadSample: document.querySelector("#loadSample"),
  fileInput: document.querySelector("#fileInput"),
  strictness: document.querySelector("#strictness"),
  authorName: document.querySelector("#authorName"),
  institution: document.querySelector("#institution"),
  workTitle: document.querySelector("#workTitle"),
  workType: document.querySelector("#workType"),
  publicRegistry: document.querySelector("#publicRegistry"),
  analyzeButton: document.querySelector("#analyzeButton"),
  overallScore: document.querySelector("#overallScore"),
  riskLabel: document.querySelector("#riskLabel"),
  meterValue: document.querySelector("#meterValue"),
  originalityBar: document.querySelector("#originalityBar"),
  authorshipBar: document.querySelector("#authorshipBar"),
  structureBar: document.querySelector("#structureBar"),
  originalityValue: document.querySelector("#originalityValue"),
  authorshipValue: document.querySelector("#authorshipValue"),
  structureValue: document.querySelector("#structureValue"),
  plagiarismValue: document.querySelector("#plagiarismValue"),
  ipfsValue: document.querySelector("#ipfsValue"),
  txValue: document.querySelector("#txValue"),
  reportBox: document.querySelector("#reportBox"),
  exportReport: document.querySelector("#exportReport"),
  mintButton: document.querySelector("#mintButton"),
  certificateTitle: document.querySelector("#certificateTitle"),
  previewToken: document.querySelector("#previewToken"),
  previewScore: document.querySelector("#previewScore"),
  previewHash: document.querySelector("#previewHash"),
  feeValue: document.querySelector("#feeValue"),
  burnValue: document.querySelector("#burnValue"),
  validatorValue: document.querySelector("#validatorValue"),
  walletBalance: document.querySelector("#walletBalance"),
  registryBody: document.querySelector("#registryBody"),
  registrySearch: document.querySelector("#registrySearch"),
  verifyInput: document.querySelector("#verifyInput"),
  verifyButton: document.querySelector("#verifyButton"),
  verifyResult: document.querySelector("#verifyResult"),
  exportRegistry: document.querySelector("#exportRegistry"),
  monthlyChecks: document.querySelector("#monthlyChecks"),
  validatorStake: document.querySelector("#validatorStake"),
  monthlyChecksValue: document.querySelector("#monthlyChecksValue"),
  validatorStakeValue: document.querySelector("#validatorStakeValue"),
  simRevenue: document.querySelector("#simRevenue"),
  simBurn: document.querySelector("#simBurn"),
  simRewards: document.querySelector("#simRewards"),
  simTreasury: document.querySelector("#simTreasury"),
  simValidators: document.querySelector("#simValidators"),
  simApr: document.querySelector("#simApr"),
  resetDemo: document.querySelector("#resetDemo"),
  backendStatus: document.querySelector("#backendStatus"),
  aiStatus: document.querySelector("#aiStatus"),
  corpusStatus: document.querySelector("#corpusStatus"),
  chainStatus: document.querySelector("#chainStatus"),
  ganacheStatus: document.querySelector("#ganacheStatus"),
  contractStatus: document.querySelector("#contractStatus"),
  networkName: document.querySelector("#networkName"),
  networkLabel: document.querySelector("#networkLabel"),
  wordCount: document.querySelector("#wordCount"),
  textQuality: document.querySelector("#textQuality"),
  strictnessValue: document.querySelector("#strictnessValue"),
  processSteps: document.querySelectorAll(".process-step"),
  toast: document.querySelector("#toast"),
};

init();

function init() {
  els.workText.value = sampleText;
  updateBalance();
  renderRegistry();
  updateEconomy();
  updateTextStats();
  updateStrictnessLabel();
  refreshSystemStatus();
  bindEvents();
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  els.workForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runReview();
  });

  els.loadSample.addEventListener("click", () => {
    els.workText.value = sampleText;
    updateTextStats();
    setProcessStep("draft");
    toast("Пример работы загружен.");
  });

  els.fileInput.addEventListener("change", handleFileUpload);
  els.workText.addEventListener("input", updateTextStats);
  els.strictness.addEventListener("input", updateStrictnessLabel);
  els.exportReport.addEventListener("click", exportReport);
  els.mintButton.addEventListener("click", mintCertificate);
  els.registrySearch.addEventListener("input", renderRegistry);
  els.verifyButton.addEventListener("click", verifyCertificate);
  els.exportRegistry.addEventListener("click", exportRegistry);
  els.monthlyChecks.addEventListener("input", updateEconomy);
  els.validatorStake.addEventListener("input", updateEconomy);
  els.resetDemo.addEventListener("click", resetDemo);
}

function switchTab(tabName) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
  els.panels.forEach((panel) => panel.classList.toggle("active", panel.id === `tab-${tabName}`));
  document.querySelector(".workspace")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

async function handleFileUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const isTextFile =
    file.type.startsWith("text/") || [".txt", ".md", ".csv", ".json"].some((ext) => file.name.toLowerCase().endsWith(ext));

  if (!isTextFile) {
    toast("В демо читаются TXT, MD, CSV и JSON. Для DOCX/PDF нужен backend-этап.");
    return;
  }

  els.workText.value = await file.text();
  updateTextStats();
  setProcessStep("draft");
  if (!els.workTitle.value.trim()) {
    els.workTitle.value = file.name.replace(/\.[^.]+$/, "");
  }
  toast(`Файл "${file.name}" добавлен в заявку.`);
}

async function runReview() {
  const text = els.workText.value.trim();
  if (text.length < 120) {
    toast("Добавьте более подробный текст работы для анализа.");
    return;
  }

  const fee = BASE_FEE + Number(els.strictness.value) * 3;
  if (state.balance < fee) {
    toast("Недостаточно EDP для проверки.");
    return;
  }

  setAnalyzeLoading(true);
  try {
    setProcessStep("analysis");
    els.backendStatus.textContent = "анализ";
    const analysis = await analyzeWork(text, Number(els.strictness.value));
    const workHash = analysis.workHash || (await sha256(text));
    const reportHash = analysis.reportHash || (await sha256(JSON.stringify(analysis)));
    const tokenId = nextTokenId();

    state.pendingCertificate = {
      tokenId,
      title: els.workTitle.value.trim() || "Без названия",
      author: els.authorName.value.trim() || "Не указан",
      institution: els.institution.value.trim() || "Не указан",
      workType: els.workType.value,
      publicRegistry: els.publicRegistry.checked,
      score: analysis.overall,
      originality: analysis.originality,
      authorship: analysis.authorship,
      structure: analysis.structure,
      summary: analysis.summary,
      recommendations: analysis.recommendations,
      flags: analysis.flags,
      plagiarism: analysis.plagiarism,
      aiSource: analysis.source,
      aiModel: analysis.model,
      risk: analysis.risk,
      workHash,
      reportHash,
      ipfsCid: analysis.ipfsCid,
      fee,
      burn: Math.round(fee * BURN_RATE * 100) / 100,
      validatorReward: Math.round(fee * VALIDATOR_RATE * 100) / 100,
      treasury: Math.round(fee * TREASURY_RATE * 100) / 100,
      metadataURI: analysis.metadataURI || `ipfs://eduproof/${workHash.slice(2, 18)}`,
      metadataGatewayURL: analysis.metadataGatewayURL,
      pipeline: analysis.pipeline || ["Browser", "Client fallback"],
      issuedAt: null,
    };

    renderAnalysis(state.pendingCertificate);
    state.lastReport = state.pendingCertificate;
    setProcessStep("metadata");
    refreshSystemStatus();
    toast(
      analysis.source === "local"
        ? "Сформирован локальный отчет: антиплагиат + резервная оценка."
        : "AI-отчет и антиплагиат сформированы. Можно выпускать сертификат.",
    );
  } finally {
    setAnalyzeLoading(false);
  }
}

async function analyzeWork(text, strictness) {
  try {
    return await requestNeuralAnalysis(text, strictness);
  } catch (error) {
    console.warn("Neural analysis failed, using local fallback:", error);
    return analyzeWorkLocally(text, strictness, error);
  }
}

async function requestNeuralAnalysis(text, strictness) {
  if (!window.location.protocol.startsWith("http")) {
    throw new Error("AI backend requires the app to be opened through server.js.");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12000);
  const response = await fetch("/api/analyze-work", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
    body: JSON.stringify({
      text,
      strictness,
      title: els.workTitle.value.trim(),
      workType: els.workType.value,
    }),
  }).finally(() => window.clearTimeout(timeout));

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || "AI backend returned an error.");
  }

  return normalizeAnalysis(payload.analysis, {
    source: payload.provider || "server",
    model: payload.model || "neural model",
    workHash: payload.workHash,
    reportHash: payload.reportHash,
    metadataURI: payload.metadata?.uri,
    metadataGatewayURL: payload.metadata?.gatewayURL,
    ipfsCid: payload.metadata?.cid,
    pipeline: payload.pipeline,
  });
}

function analyzeWorkLocally(text, strictness, cause) {
  const normalized = text.toLowerCase().replace(/[^а-яa-z0-9ё\s.]/g, " ");
  const words = normalized.split(/\s+/).filter(Boolean);
  const unique = new Set(words);
  const sentences = normalized.split(/[.!?]+/).map((item) => item.trim()).filter(Boolean);
  const repeatedSentenceCount = sentences.length - new Set(sentences).size;
  const references = (text.match(/источник|литератур|reference|doi|http|ipfs|blockchain|смарт/gi) || []).length;
  const structureMarkers = (text.match(/архитектур|экономик|roadmap|этап|контракт|интерфейс|модель/gi) || []).length;
  const suspiciousMarkers = (text.match(/как языковая модель|не могу выполнить|lorem ipsum|chatgpt/gi) || []).length;

  const wordScore = clamp((words.length / 260) * 28, 0, 28);
  const uniqueRatio = words.length ? unique.size / words.length : 0;
  const originality = clamp(48 + uniqueRatio * 42 + references * 1.8 - repeatedSentenceCount * 9 - suspiciousMarkers * 15 - strictness * 1.4, 0, 100);
  const authorship = clamp(52 + wordScore + Math.min(sentences.length, 18) * 1.2 - repeatedSentenceCount * 8 - suspiciousMarkers * 12 - strictness * 1.6, 0, 100);
  const structure = clamp(46 + structureMarkers * 4.8 + references * 2.2 + Math.min(words.length / 20, 22) - strictness, 0, 100);
  const overall = Math.round(originality * 0.4 + authorship * 0.3 + structure * 0.3);
  const risk = overall >= 85 ? "Низкий риск" : overall >= 70 ? "Средний риск" : "Требуется доработка";

  return {
    overall,
    originality: Math.round(originality),
    authorship: Math.round(authorship),
    structure: Math.round(structure),
    words: words.length,
    references,
    repeatedSentenceCount,
    suspiciousMarkers,
    risk,
    source: "fallback",
    model: "local heuristic",
    summary: "Нейросеть не ответила, поэтому приложение рассчитало резервную оценку по структуре текста, словарному разнообразию и повторам.",
    recommendations: [
      "Запустите приложение через server.js и подключите Ollama или OpenAI-compatible API для нейросетевой проверки.",
      "Добавьте больше ссылок на источники, архитектурных деталей и экономического обоснования проекта.",
    ],
    flags: suspiciousMarkers ? ["Найдены маркеры возможного машинного шаблона."] : ["Критических маркеров в резервном анализе не найдено."],
    plagiarism: {
      method: "client-only fallback",
      checkedSources: 0,
      similarity: 0,
      uniquePercent: Math.round(originality),
      status: "Корпус не подключен",
      matches: [],
    },
    fallbackReason: cause?.message || "AI backend is unavailable.",
  };
}

function normalizeAnalysis(analysis, meta) {
  const normalized = {
    overall: clampInt(analysis?.overall, 0, 100),
    originality: clampInt(analysis?.originality, 0, 100),
    authorship: clampInt(analysis?.authorship, 0, 100),
    structure: clampInt(analysis?.structure, 0, 100),
    words: clampInt(analysis?.words ?? analysis?.word_count, 0, 100000),
    references: clampInt(analysis?.references, 0, 1000),
    repeatedSentenceCount: clampInt(analysis?.repeatedSentenceCount ?? analysis?.repeated_sentence_count, 0, 1000),
    suspiciousMarkers: clampInt(analysis?.suspiciousMarkers ?? analysis?.suspicious_markers, 0, 1000),
    risk: typeof analysis?.risk === "string" ? analysis.risk : "Средний риск",
    summary: typeof analysis?.summary === "string" ? analysis.summary : "Нейросеть сформировала краткую оценку работы.",
    recommendations: normalizeStringList(analysis?.recommendations),
    flags: normalizeStringList(analysis?.flags),
    plagiarism: normalizePlagiarism(analysis?.plagiarism),
    source: meta.source,
    model: meta.model,
    workHash: meta.workHash,
    reportHash: meta.reportHash,
    metadataURI: meta.metadataURI,
    metadataGatewayURL: meta.metadataGatewayURL,
    ipfsCid: meta.ipfsCid,
    pipeline: Array.isArray(meta.pipeline) ? meta.pipeline : [],
  };

  if (!normalized.overall) {
    normalized.overall = Math.round(normalized.originality * 0.4 + normalized.authorship * 0.3 + normalized.structure * 0.3);
  }

  return normalized;
}

function renderAnalysis(cert) {
  setScore("overallScore", cert.score);
  els.riskLabel.textContent = cert.risk;
  const meterLength = 427;
  els.meterValue.style.strokeDashoffset = String(meterLength - (meterLength * cert.score) / 100);
  els.meterValue.style.stroke = cert.score >= 85 ? "var(--green)" : cert.score >= 70 ? "var(--blue)" : "var(--red)";
  setMetric(els.originalityBar, els.originalityValue, cert.originality);
  setMetric(els.authorshipBar, els.authorshipValue, cert.authorship);
  setMetric(els.structureBar, els.structureValue, cert.structure);
  els.plagiarismValue.textContent = `${cert.plagiarism?.similarity || 0}%`;
  els.ipfsValue.textContent = cert.ipfsCid ? shortCid(cert.ipfsCid) : "-";
  els.txValue.textContent = cert.transactionHash ? shortHash(cert.transactionHash) : "-";

  els.reportBox.innerHTML = `
    <p><strong>AI engine:</strong> ${escapeHtml(formatAiEngine(cert.aiSource, cert.aiModel))}</p>
    <p><strong>Антиплагиат:</strong> ${cert.plagiarism.similarity}% совпадений, ${cert.plagiarism.uniquePercent}% уникальности · ${escapeHtml(cert.plagiarism.status)}</p>
    <p><strong>Метод:</strong> ${escapeHtml(cert.plagiarism.method)} · источников: ${cert.plagiarism.checkedSources}</p>
    ${renderPlagiarismMatches(cert.plagiarism.matches)}
    <p><strong>AI summary:</strong> ${escapeHtml(cert.summary || "Отчет сформирован.")}</p>
    <p><strong>Recommendations:</strong> ${renderInlineList(cert.recommendations)}</p>
    <p><strong>Flags:</strong> ${renderInlineList(cert.flags)}</p>
    <p><strong>Work hash:</strong> ${cert.workHash}</p>
    <p><strong>AI report hash:</strong> ${cert.reportHash}</p>
    <p><strong>IPFS metadata:</strong> ${escapeHtml(cert.metadataURI)}${cert.ipfsCid ? ` · CID ${escapeHtml(cert.ipfsCid)}` : ""}</p>
    <p><strong>Pipeline:</strong> ${renderInlineList(cert.pipeline)}</p>
    ${cert.transactionHash ? `<p><strong>Tx hash:</strong> ${escapeHtml(cert.transactionHash)} · block ${escapeHtml(cert.blockNumber)}</p>` : ""}
    <p><strong>Статус:</strong> ${cert.score >= 70 ? "сертификат может быть выпущен" : "нужна повторная проверка после доработки"}</p>
  `;

  els.certificateTitle.textContent = cert.title;
  els.previewToken.textContent = cert.tokenId;
  els.previewScore.textContent = `${cert.score}/100`;
  els.previewHash.textContent = shortHash(cert.workHash);
  els.feeValue.textContent = `${cert.fee} EDP`;
  els.burnValue.textContent = `${cert.burn} EDP`;
  els.validatorValue.textContent = `${cert.validatorReward} EDP`;
}

function setMetric(bar, valueEl, value) {
  bar.style.width = `${value}%`;
  bar.style.background = value >= 85 ? "var(--green)" : value >= 70 ? "var(--blue)" : "var(--amber)";
  valueEl.textContent = `${value}%`;
}

function setScore(id, value) {
  document.querySelector(`#${id}`).textContent = value;
}

async function mintCertificate() {
  const cert = state.pendingCertificate;
  if (!cert) {
    toast("Сначала выполните AI-проверку.");
    return;
  }
  if (cert.score < 70) {
    toast("Сертификат не выпускается: итоговый балл ниже 70.");
    return;
  }
  if (state.balance < cert.fee) {
    toast("Недостаточно EDP для выпуска сертификата.");
    return;
  }

  const minted = await mintOnBackend(cert);

  state.registry.unshift(minted);
  state.balance = Math.round((state.balance - cert.fee) * 100) / 100;
  state.lastReport = minted;
  state.pendingCertificate = null;
  persist();
  updateBalance();
  renderRegistry();
  els.txValue.textContent = minted.transactionHash ? shortHash(minted.transactionHash) : "-";
  setProcessStep("mint");
  refreshSystemStatus();
  switchTab("registry");
  els.verifyInput.value = minted.tokenId;
  verifyCertificate();
  toast(`NFT-сертификат ${minted.tokenId} выпущен и записан в реестр.`);
}

async function mintOnBackend(cert) {
  const fallbackMinted = {
    ...cert,
    issuedAt: new Date().toISOString(),
    status: "active",
    network: "Local browser registry",
    pipeline: [...(cert.pipeline || []), "Browser mint fallback"],
  };

  if (!window.location.protocol.startsWith("http")) {
    return fallbackMinted;
  }

  try {
    const response = await fetch("/api/mint-certificate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificate: cert }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Mint endpoint returned an error.");
    }

    return {
      ...cert,
      ...payload.minted,
      pipeline: [...(cert.pipeline || []), ...(payload.pipeline || [])],
    };
  } catch (error) {
    console.warn("Backend mint failed, using browser registry fallback:", error);
    return fallbackMinted;
  }
}

function renderRegistry() {
  const query = els.registrySearch.value.trim().toLowerCase();
  const filtered = state.registry.filter((item) => {
    const haystack = `${item.tokenId} ${item.author} ${item.title} ${item.workHash}`.toLowerCase();
    return haystack.includes(query);
  });

  if (!filtered.length) {
    els.registryBody.innerHTML = `<tr><td class="empty-state" colspan="5">В реестре пока нет сертификатов.</td></tr>`;
    return;
  }

  els.registryBody.innerHTML = filtered
    .map(
      (item) => `
        <tr data-token="${item.tokenId}">
          <td>${item.tokenId}</td>
          <td>${escapeHtml(item.publicRegistry ? item.author : "Скрыт")}</td>
          <td>${escapeHtml(item.title)}<br><small>${shortHash(item.workHash)}</small></td>
          <td>${item.score}/100</td>
          <td>${formatDate(item.issuedAt)}</td>
        </tr>
      `,
    )
    .join("");

  els.registryBody.querySelectorAll("tr[data-token]").forEach((row) => {
    row.addEventListener("click", () => {
      els.verifyInput.value = row.dataset.token;
      verifyCertificate();
    });
  });
}

async function refreshSystemStatus() {
  if (!window.location.protocol.startsWith("http")) {
    els.backendStatus.textContent = "file mode";
    els.aiStatus.textContent = "client fallback";
    els.corpusStatus.textContent = "недоступен";
    els.chainStatus.textContent = "browser";
    els.ganacheStatus.textContent = "n/a";
    els.contractStatus.textContent = "n/a";
    els.networkName.textContent = "Browser demo";
    els.networkLabel.textContent = "localStorage registry";
    return;
  }

  try {
    const [statusResponse, corpusResponse] = await Promise.all([
      fetch("/api/status"),
      fetch("/api/corpus"),
    ]);
    const status = await statusResponse.json();
    const corpus = await corpusResponse.json();

    els.backendStatus.textContent = status.ok ? "online" : "ошибка";
    els.aiStatus.textContent = status.ai ? `${status.ai.provider}: ${status.ai.model}` : "fallback";
    els.corpusStatus.textContent = corpus.ok ? `${corpus.count} источника` : "ошибка";
    const chainTarget = getChainTarget(status.chain);
    els.chainStatus.textContent = chainTarget.short;
    els.ganacheStatus.textContent = formatGanacheStatus(status.chain?.ganache);
    els.contractStatus.textContent = formatContractStatus(status.chain?.contract, status.chain?.ganache);
    els.networkName.textContent = chainTarget.name;
    els.networkLabel.textContent = chainTarget.label;
  } catch {
    els.backendStatus.textContent = "offline";
    els.aiStatus.textContent = "client fallback";
    els.corpusStatus.textContent = "недоступен";
    els.chainStatus.textContent = "browser";
    els.ganacheStatus.textContent = "offline";
    els.contractStatus.textContent = "unknown";
    els.networkName.textContent = "Browser demo";
    els.networkLabel.textContent = "local fallback";
  }
}

function formatGanacheStatus(ganache) {
  if (!ganache) return "unknown";
  if (!ganache.online) return "offline";
  return `${ganache.accountCount || 0} accounts`;
}

function formatContractStatus(contract, ganache) {
  if (!contract) return "unknown";
  if (!ganache?.online && contract.artifact) return "artifact ready";
  if (contract.deployed && contract.address) return shortHash(contract.address);
  if (contract.artifact) return "artifact only";
  return "not compiled";
}

function getChainTarget(chain) {
  if (!chain) {
    return { name: "Fallback registry", label: "local JSON", short: "fallback" };
  }

  const rpc = chain.rpc || "";
  if (/127\.0\.0\.1|localhost/.test(rpc)) {
    return {
      name: "Ganache Local",
      label: `${chain.network || "development"} · ${rpc.replace(/^https?:\/\//, "")}`,
      short: "truffle / ganache",
    };
  }

  if (/amoy/i.test(rpc) || /amoy/i.test(chain.network || "")) {
    return {
      name: "Polygon Amoy",
      label: chain.network || "testnet",
      short: "polygon amoy",
    };
  }

  return {
    name: chain.mode || "Blockchain",
    label: chain.network || rpc || "network",
    short: chain.mode || "chain",
  };
}

function updateTextStats() {
  const words = els.workText.value.trim().split(/\s+/).filter(Boolean).length;
  els.wordCount.textContent = `${words} слов`;

  if (words < 60) {
    els.textQuality.textContent = "мало текста для уверенной проверки";
  } else if (words < 180) {
    els.textQuality.textContent = "достаточно для демо-анализа";
  } else {
    els.textQuality.textContent = "хороший объем для проверки";
  }
}

function updateStrictnessLabel() {
  els.strictnessValue.textContent = `${els.strictness.value}/5`;
}

function setAnalyzeLoading(isLoading) {
  els.analyzeButton.disabled = isLoading;
  els.analyzeButton.classList.toggle("is-loading", isLoading);
  els.analyzeButton.querySelector("span").textContent = isLoading ? "Проверка..." : "Проверить работу";
}

function setProcessStep(activeStep) {
  const order = ["draft", "analysis", "metadata", "mint"];
  const activeIndex = order.indexOf(activeStep);
  els.processSteps.forEach((step) => {
    const index = order.indexOf(step.dataset.step);
    step.classList.toggle("active", index === activeIndex);
    step.classList.toggle("done", index !== -1 && activeIndex !== -1 && index < activeIndex);
  });
}

function verifyCertificate() {
  const value = els.verifyInput.value.trim().toLowerCase();
  const match = state.registry.find(
    (item) => item.tokenId.toLowerCase() === value || item.workHash.toLowerCase() === value || shortHash(item.workHash).toLowerCase() === value,
  );

  els.verifyResult.classList.remove("success", "error");

  if (!value) {
    els.verifyResult.innerHTML = `<strong>Нет запроса</strong><span>Введите идентификатор сертификата из реестра.</span>`;
    return;
  }

  if (!match) {
    els.verifyResult.classList.add("error");
    els.verifyResult.innerHTML = `<strong>Запись не найдена</strong><span>В локальном демо-реестре нет такого Token ID или хеша.</span>`;
    return;
  }

  els.verifyResult.classList.add("success");
  els.verifyResult.innerHTML = `
    <strong>${match.tokenId} подтвержден</strong>
    <span>${escapeHtml(match.title)} · ${match.score}/100 · ${formatDate(match.issuedAt)}</span>
    <span>Metadata: ${match.metadataURI}</span>
    ${match.transactionHash ? `<span>Tx: ${match.transactionHash} · ${match.network}</span>` : ""}
  `;
}

function updateEconomy() {
  const checks = Number(els.monthlyChecks.value);
  const stake = Number(els.validatorStake.value);
  const averageFee = BASE_FEE + 9;
  const revenue = checks * averageFee;
  const burned = revenue * BURN_RATE;
  const rewards = revenue * VALIDATOR_RATE;
  const treasury = revenue * TREASURY_RATE;
  const validators = Math.max(8, Math.round(checks / 500));
  const yearlyRewardPerValidator = (rewards * 12) / validators;
  const apr = (yearlyRewardPerValidator / stake) * 100;

  els.monthlyChecksValue.textContent = formatNumber(checks);
  els.validatorStakeValue.textContent = `${formatNumber(stake)} EDP`;
  els.simRevenue.textContent = `${formatNumber(revenue)} EDP`;
  els.simBurn.textContent = `${formatNumber(burned)} EDP`;
  els.simRewards.textContent = `${formatNumber(rewards)} EDP`;
  els.simTreasury.textContent = `${formatNumber(treasury)} EDP`;
  els.simValidators.textContent = formatNumber(validators);
  els.simApr.textContent = `${apr.toFixed(1)}%`;
}

function exportReport() {
  const report = state.pendingCertificate || state.lastReport || state.registry[0];
  if (!report) {
    toast("Сначала выполните AI-проверку, чтобы экспортировать отчет.");
    return;
  }

  downloadJson(`eduproof-report-${report.tokenId || "draft"}.json`, {
    exportedAt: new Date().toISOString(),
    project: "EduProof AI",
    report: {
      tokenId: report.tokenId,
      title: report.title,
      author: report.publicRegistry === false ? "hidden" : report.author,
      institution: report.institution,
      workType: report.workType,
      score: report.score,
      originality: report.originality,
      authorship: report.authorship,
      structure: report.structure,
      risk: report.risk,
      summary: report.summary,
      recommendations: report.recommendations,
      flags: report.flags,
      plagiarism: report.plagiarism,
      ai: {
        source: report.aiSource,
        model: report.aiModel,
      },
      hashes: {
        workHash: report.workHash,
        reportHash: report.reportHash,
      },
      metadata: {
        uri: report.metadataURI,
        cid: report.ipfsCid,
        gatewayURL: report.metadataGatewayURL,
      },
      chain: {
        network: report.network || "pending",
        transactionHash: report.transactionHash || null,
        contractAddress: report.contractAddress || null,
        fallbackReason: report.fallbackReason || null,
      },
      pipeline: report.pipeline || [],
    },
  });
  toast("AI-отчет подготовлен для экспорта.");
}

function exportRegistry() {
  if (!state.registry.length) {
    toast("Реестр пуст.");
    return;
  }

  const payload = JSON.stringify(state.registry, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "eduproof-registry.json";
  link.click();
  URL.revokeObjectURL(url);
  toast("JSON реестра подготовлен.");
}

function downloadJson(filename, value) {
  const payload = JSON.stringify(value, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function resetDemo() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(BALANCE_KEY);
  state.registry = [];
  state.balance = DEFAULT_BALANCE;
  state.pendingCertificate = null;
  state.lastReport = null;
  persist();
  updateBalance();
  renderRegistry();
  renderEmptyAnalysis();
  toast("Демо-состояние сброшено.");
}

function renderEmptyAnalysis() {
  setScore("overallScore", 0);
  els.riskLabel.textContent = "Ожидает анализа";
  els.meterValue.style.strokeDashoffset = "427";
  setMetric(els.originalityBar, els.originalityValue, 0);
  setMetric(els.authorshipBar, els.authorshipValue, 0);
  setMetric(els.structureBar, els.structureValue, 0);
  els.plagiarismValue.textContent = "0%";
  els.ipfsValue.textContent = "-";
  els.txValue.textContent = "-";
  els.reportBox.innerHTML = "<p>После проверки здесь появятся хеш работы, AI-отчет, стоимость выпуска и статус сертификата.</p>";
  els.certificateTitle.textContent = "Работа еще не проверена";
  els.previewToken.textContent = "-";
  els.previewScore.textContent = "-";
  els.previewHash.textContent = "-";
  els.feeValue.textContent = "0 EDP";
  els.burnValue.textContent = "0 EDP";
  els.validatorValue.textContent = "0 EDP";
  setProcessStep("draft");
}

async function sha256(message) {
  if (window.crypto?.subtle) {
    const data = new TextEncoder().encode(message);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    return `0x${Array.from(new Uint8Array(hashBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  let hash = 0;
  for (let index = 0; index < message.length; index += 1) {
    hash = (Math.imul(31, hash) + message.charCodeAt(index)) | 0;
  }
  return `0x${Math.abs(hash).toString(16).padStart(64, "0")}`;
}

function nextTokenId() {
  const next = state.registry.length + 1;
  const suffix = Math.random().toString(16).slice(2, 6).toUpperCase();
  return `EDP-${String(next).padStart(4, "0")}-${suffix}`;
}

function loadRegistry() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function loadBalance() {
  const stored = Number(localStorage.getItem(BALANCE_KEY));
  return Number.isFinite(stored) && stored > 0 ? stored : DEFAULT_BALANCE;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.registry));
  localStorage.setItem(BALANCE_KEY, String(state.balance));
}

function updateBalance() {
  els.walletBalance.textContent = `${formatNumber(state.balance)} EDP`;
}

function shortHash(hash) {
  if (!hash || hash === "-") return "-";
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

function shortCid(cid) {
  if (!cid || cid === "-") return "-";
  return `${cid.slice(0, 10)}...${cid.slice(-6)}`;
}

function formatDate(iso) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatNumber(value) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(value);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampInt(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.round(clamp(number, min, max));
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 5);
}

function normalizePlagiarism(value) {
  const matches = Array.isArray(value?.matches)
    ? value.matches
        .map((match) => ({
          title: String(match.title || "Источник"),
          type: String(match.type || "source"),
          url: String(match.url || "local corpus"),
          similarity: clampInt(match.similarity, 0, 100),
          excerpt: String(match.excerpt || "").slice(0, 260),
        }))
        .slice(0, 6)
    : [];

  const similarity = clampInt(value?.similarity, 0, 100);
  return {
    method: String(value?.method || "not available"),
    checkedSources: clampInt(value?.checkedSources, 0, 100000),
    similarity,
    uniquePercent: clampInt(value?.uniquePercent ?? 100 - similarity, 0, 100),
    status: String(value?.status || "Нет данных"),
    matches,
  };
}

function formatAiEngine(source, model) {
  if (source === "ollama") return `локальная нейросеть Ollama · ${model}`;
  if (source === "openai") return `OpenAI-compatible API · ${model}`;
  if (source === "local") return "локальный антиплагиат + эвристическая оценка";
  return model || "server analysis";
}

function renderPlagiarismMatches(matches) {
  if (!matches?.length) {
    return `<div class="match-list"><span>Совпадающих источников в локальном корпусе не найдено.</span></div>`;
  }

  return `
    <div class="match-list">
      ${matches
        .map(
          (match) => `
            <div>
              <strong>${escapeHtml(match.title)} · ${match.similarity}%</strong>
              <span>${escapeHtml(match.excerpt || match.type)}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderInlineList(items) {
  if (!items?.length) return "нет";
  return items.map((item) => escapeHtml(item)).join("; ");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

let toastTimer;
function toast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}
