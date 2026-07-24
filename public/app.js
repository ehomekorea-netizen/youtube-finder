// Application State
let pc = null;
let dataChannel = null;
let ws = null;
let audioContext = null;
let analyser = null;
let isRecording = false;
let isMockMode = false;
let mapInstance = null;
let travelPath = []; 
let polylineInstance = null;
let mapMarkers = [];
let grokTranscriptText = ""; // 그록의 음성 자막 누적용 변수
let nextPlaybackTime = 0;   // 오디오 끊김 방지용 절대 예약 시각 추적 변수
let currentUserBubble = null; // 현재 렌더링 중인 사용자 말풍선 객체
let currentGrokBubble = null; // 현재 렌더링 중인 그록 말풍선 객체
let typingQueue = [];         // 타이핑 대기 문자열 큐
let isTypingLoopRunning = false; // 타이핑 루프 실행 여부 식별자
let grokTextFinished = false;  // 그록의 텍스트 생성 완료 플래그
let hasRenderedYoutubeWidget = false; // 최초 썸네일 노출 여부 추적 플래그
let recognition = null;               // 브라우저 WebSpeech API 객체 참조
let welcomeAudio = null;              // 로컬 웰컴 오디오 객체 참조
let idleTimer = null;                 // 무반응 세션 자동 종료 타이머 참조
let isResponseActive = false;         // 서버가 현재 응답을 생성/출력 중인지 여부 추적 플래그
let OUTPUT_SAMPLE_RATE = 24000;       // 출력 오디오 샘플레이트 (기본값 24000, config에 의해 48000 등으로 업데이트)




// Editor & Preset Data Definition
const PRESETS = {
  template: `<Card size="sm" theme="light" confirmLabel="텔레그램 전송" confirmAction="telegram_send">
  <Col gap={2}>
    <Row justify="space-between">
      <Title value="추천 유튜브 영상 목록" size="md" />
      <Badge label={searchQuery} color="info" />
    </Row>
    <Divider flush="true" />
    <ListView>
      <ListViewItem>
        <Row gap={3}>
          <Image src={video1_thumbnail} size={50} radius="md" />
          <Col>
            <Text value={video1_title} weight="bold" size="sm" />
            <Caption value={video1_channel} />
          </Col>
        </Row>
      </ListViewItem>
      <ListViewItem>
        <Row gap={3}>
          <Image src={video2_thumbnail} size={50} radius="md" />
          <Col>
            <Text value={video2_title} weight="bold" size="sm" />
            <Caption value={video2_channel} />
          </Col>
        </Row>
      </ListViewItem>
      <ListViewItem>
        <Row gap={3}>
          <Image src={video3_thumbnail} size={50} radius="md" />
          <Col>
            <Text value={video3_title} weight="bold" size="sm" />
            <Caption value={video3_channel} />
          </Col>
        </Row>
      </ListViewItem>
    </ListView>
  </Col>
</Card>`,
  
  data: `{
  "searchQuery": "AI 에이전트 혁명",
  "video1_title": "AI 에이전트가 바꿀 우리의 미래 (10분 정리)",
  "video1_channel": "테크나우 TechNow",
  "video1_thumbnail": "https://img.youtube.com/vi/F3P4Q4zX9F0/hqdefault.jpg",
  "video1_url": "https://www.youtube.com/watch?v=F3P4Q4zX9F0",
  "video2_title": "OpenAI Realtime API 실전 코딩 가이드",
  "video2_channel": "코드팩토리 CodeFactory",
  "video2_thumbnail": "https://img.youtube.com/vi/J_Vv9_kF9g0/hqdefault.jpg",
  "video2_url": "https://www.youtube.com/watch?v=J_Vv9_kF9g0",
  "video3_title": "PlayMCP를 활용한 카카오톡 자동화 봇 만들기",
  "video3_channel": "개발자 데브린 DevLynn",
  "video3_thumbnail": "https://img.youtube.com/vi/Zp9h5pXw2lQ/hqdefault.jpg",
  "video3_url": "https://www.youtube.com/watch?v=Zp9h5pXw2lQ"
}`,
  
  schema: `import { z } from "zod";

const WidgetState = z.strictObject({
  searchQuery: z.string(),
  video1_title: z.string(),
  video1_channel: z.string(),
  video1_thumbnail: z.string(),
  video1_url: z.string(),
  video2_title: z.string(),
  video2_channel: z.string(),
  video2_thumbnail: z.string(),
  video2_url: z.string(),
  video3_title: z.string(),
  video3_channel: z.string(),
  video3_thumbnail: z.string(),
  video3_url: z.string(),
});

export default WidgetState;`
};

// DOM Elements
const micBtn = document.getElementById("orb-mic-btn");
const cancelBtn = document.getElementById("cancel-btn");
const statusIndicator = document.getElementById("connection-status");
const modeDisplay = document.getElementById("mode-display"); // UI 제거로 null 상태
const cardStack = document.getElementById("card-stack");
const welcomeCard = document.getElementById("welcome-card");
const mapCard = document.getElementById("map-card");
const visualizerCanvas = document.getElementById("audio-visualizer");
const captionOverlay = document.getElementById("caption-overlay");
const captionSpeaker = document.getElementById("caption-speaker");
const captionText = document.getElementById("caption-text");

// 챗 입력창 (UI에서 제거되었으나 호환 참조 유지)
const chatInput = document.getElementById("chat-input");

// Editor Elements
const tabBtns = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");
const jsxEditor = document.getElementById("jsx-template");
const jsonDataEditor = document.getElementById("json-data");
const zodSchemaEditor = document.getElementById("zod-schema");
const compileBtn = document.getElementById("compile-btn");

// Init Application
window.addEventListener("DOMContentLoaded", () => {
  initMap();
  setupEventListeners();
  initVisualizer();
  loadPresets();
  initLottieLogo();
});

// 1. 카카오 지도 SDK 초기화
function initMap() {
  const mapContainer = document.getElementById("kakao-map");
  const fallbackContainer = document.getElementById("mock-map-fallback");

  if (typeof kakao !== 'undefined' && kakao.maps) {
    console.log("🗺️ 카카오 지도 SDK 연동 완료.");
    const mapOption = {
      center: new kakao.maps.LatLng(35.1152, 129.0422),
      level: 4
    };
    mapInstance = new kakao.maps.Map(mapContainer, mapOption);
    
    polylineInstance = new kakao.maps.Polyline({
      strokeWeight: 4,
      strokeColor: '#4a8df8',
      strokeOpacity: 0.8,
      strokeStyle: 'solid'
    });
    polylineInstance.setMap(mapInstance);
  } else {
    console.warn("⚠️ 카카오 지도 SDK가 없습니다. Mock Map SVG를 활성화합니다.");
    mapContainer.classList.add("hidden");
    fallbackContainer.classList.remove("hidden");
    drawMockMapGrid();
  }
}

// 2. Mock Map 격자 그리기
function drawMockMapGrid() {
  const svg = document.getElementById("mock-svg-path");
  if (!svg) return;
  svg.innerHTML = `
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0, 0, 0, 0.04)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)" />
    <circle cx="50%" cy="50%" r="50" stroke="rgba(74, 141, 248, 0.08)" stroke-width="1.5" fill="none"/>
    <text x="15" y="25" fill="rgba(0, 0, 0, 0.15)" font-size="10" font-weight="700">MOCK TRAVEL MAP</text>
  `;
}

// 3. 동적 JSON 위젯 에셋 파일 로드 및 에디터에 세팅
async function loadPresets() {
  try {
    const res = await fetch("/youtube-plan.json");
    const widgetConfig = await res.json();
    
    jsxEditor.value = widgetConfig.template;
    jsonDataEditor.value = JSON.stringify(widgetConfig.data, null, 2);
    zodSchemaEditor.value = widgetConfig.schema;
    console.log("📂 프로젝트 내부 youtube-plan.json 에셋 동적 로드 성공!");
  } catch (err) {
    console.warn("⚠️ 에셋 파일 로드 실패. 하드코딩된 프리셋으로 대체합니다.", err);
    jsxEditor.value = PRESETS.template;
    jsonDataEditor.value = PRESETS.data;
    zodSchemaEditor.value = PRESETS.schema;
  }
}

// 4. UI 및 에디터 탭 제어 이벤트 리스너 바인딩
function setupEventListeners() {
  micBtn.addEventListener("click", toggleSession);
  cancelBtn.addEventListener("click", stopSession);
  compileBtn.addEventListener("click", handleCompile);

  // 에디터 탭 전환 로직
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      tabBtns.forEach(b => b.classList.remove("active"));
      tabContents.forEach(c => c.classList.add("hidden"));

      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      document.getElementById(`tab-content-${tabId}`).classList.remove("hidden");
    });
  });
}

// ==========================================================
// 🛠️ 5. JSX 템플릿 컴파일러 & 데이터 바인더 엔진 (AGENTS.md 스펙 준수)
// ==========================================================
function handleCompile() {
  const sourceText = jsxEditor.value.trim();

  // 웰컴 카드를 숨김
  if (welcomeCard) welcomeCard.classList.add("hidden");

  let compiledNode = null;

  // 1) 만약 입력 텍스트가 중괄호 '{'로 시작한다면 공식 Layout JSON AST로 판단하여 즉각 렌더링
  if (sourceText.startsWith("{")) {
    try {
      const ast = JSON.parse(sourceText);
      compiledNode = renderJSONAST(ast);
    } catch (err) {
      alert("❌ Layout JSON AST 문법 에러: " + err.message);
      return;
    }
  } else {
    // 2) 일반 JSX 마크업인 경우, 우측 JSON 데이터를 주입하여 컴파일 수행
    const jsonSource = jsonDataEditor.value.trim();
    let data = {};
    try {
      data = JSON.parse(jsonSource);
    } catch (err) {
      alert("❌ JSON 데이터 오류: " + err.message);
      return;
    }

    try {
      compiledNode = compileJSXToHTML(sourceText, data);
    } catch (err) {
      alert("❌ JSX 컴파일 실패: " + err.message);
      return;
    }
  }

  if (compiledNode) {
    cardStack.appendChild(compiledNode);

    // 스크롤 최하단 자동 이동
    const scrollArea = document.querySelector(".card-display-area");
    scrollArea.scrollTo({
      top: scrollArea.scrollHeight,
      behavior: 'smooth'
    });
  }
}

// 🛠️ 공식 Layout JSON AST 전용 재귀 렌더러 엔진
function renderJSONAST(node) {
  if (!node || !node.type) return null;
  
  const type = node.type;
  let domElement = null;

  switch (type) {
    case "Card":
      domElement = document.createElement("div");
      domElement.className = "floating-card";
      
      const size = node.size || "sm";
      domElement.classList.add(`size-${size}`);

      const background = node.background;
      if (background) {
        domElement.style.background = background;
        domElement.style.color = "white";
      }

      // padding 객체 처리 (예: {x: 4, y: 8})
      if (node.padding) {
        if (typeof node.padding === "object") {
          const pt = node.padding.top ?? node.padding.y ?? 0;
          const pb = node.padding.bottom ?? node.padding.y ?? 0;
          const pl = node.padding.left ?? node.padding.x ?? 0;
          const pr = node.padding.right ?? node.padding.x ?? 0;
          domElement.style.padding = `${pt * 0.25}rem ${pr * 0.25}rem ${pb * 0.25}rem ${pl * 0.25}rem`;
        } else {
          domElement.style.padding = `${node.padding * 0.25}rem`;
        }
      }

      // 자식 노드 재귀 렌더링
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => {
          const childDom = renderJSONAST(child);
          if (childDom) domElement.appendChild(childDom);
        });
      }

      // confirm / cancel 액션 버튼 처리
      if (node.confirm || node.cancel) {
        const footer = document.createElement("div");
        footer.className = "floating-card-footer";

        if (node.cancel) {
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "widget-button variant-outline";
          cancelBtn.innerText = node.cancel.label || "Discard";
          cancelBtn.onclick = () => domElement.remove();
          footer.appendChild(cancelBtn);
        }

        if (node.confirm) {
          const confirmBtn = document.createElement("button");
          confirmBtn.className = "widget-button style-primary";
          confirmBtn.innerText = node.confirm.label || "Confirm";
          confirmBtn.onclick = () => alert("✅ 위젯 컨펌 액션 실행!");
          footer.appendChild(confirmBtn);
        }
        domElement.appendChild(footer);
      }
      break;

    case "ListView":
      domElement = document.createElement("div");
      domElement.className = "widget-listview";
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => {
          const childDom = renderJSONAST(child);
          if (childDom) domElement.appendChild(childDom);
        });
      }
      break;

    case "ListViewItem":
      domElement = document.createElement("div");
      domElement.className = "widget-listview-item";
      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => {
          const childDom = renderJSONAST(child);
          if (childDom) domElement.appendChild(childDom);
        });
      }
      break;

    case "Box":
    case "Row":
    case "Col":
      domElement = document.createElement("div");
      domElement.className = `widget-${type.toLowerCase()}`;
      
      const align = node.align;
      const justify = node.justify;
      const gap = node.gap;

      if (align) domElement.style.alignItems = align === "start" ? "flex-start" : align === "end" ? "flex-end" : align;
      if (justify) domElement.style.justifyContent = justify === "space-between" ? "space-between" : justify === "center" ? "center" : justify;
      if (gap) domElement.style.gap = `${gap * 0.25}rem`;

      if (type === "Col" && align === "center") {
        domElement.style.textAlign = "center";
        domElement.style.width = "100%";
      }

      if (node.children && Array.isArray(node.children)) {
        node.children.forEach(child => {
          const childDom = renderJSONAST(child);
          if (childDom) domElement.appendChild(childDom);
        });
      }
      break;

    case "Title":
      domElement = document.createElement("h3");
      domElement.className = "widget-title";
      const tSize = node.size || "md";
      domElement.classList.add(`size-${tSize}`);
      if (node.color) domElement.classList.add(`color-${node.color}`);
      if (node.color === "white") domElement.style.color = "white";
      if (node.weight === "normal") domElement.style.fontWeight = "400";
      domElement.innerText = node.value || "";
      if (node.textAlign) domElement.style.textAlign = node.textAlign;
      break;

    case "Text":
      domElement = document.createElement("p");
      domElement.className = "widget-text";
      const txtSize = node.size || "md";
      domElement.classList.add(`size-${txtSize}`);
      if (node.color) domElement.classList.add(`color-${node.color}`);
      if (node.weight === "bold") domElement.style.fontWeight = "700";
      if (node.textAlign) domElement.style.textAlign = node.textAlign;
      domElement.innerText = node.value || "";
      break;

    case "Caption":
      domElement = document.createElement("span");
      domElement.className = "widget-caption";
      const capSize = node.size || "md";
      domElement.classList.add(`size-${capSize}`);
      if (node.color) domElement.classList.add(`color-${node.color}`);
      if (node.color === "white") domElement.style.color = "white";
      domElement.innerText = node.value || "";
      break;

    case "Badge":
      domElement = document.createElement("span");
      domElement.className = "widget-badge";
      domElement.innerText = node.label || "";
      break;

    case "Image":
      domElement = document.createElement("img");
      domElement.className = "widget-image";
      domElement.setAttribute("src", node.src || "");
      const imgSize = node.size;
      if (imgSize) {
        domElement.style.width = `${imgSize}px`;
        domElement.style.height = `${imgSize}px`;
      }
      const radius = node.radius;
      if (radius) {
        domElement.style.borderRadius = radius === "md" ? "12px" : `${radius}px`;
      }
      break;

    case "Divider":
      domElement = document.createElement("div");
      domElement.className = "widget-divider";
      if (node.flush === true || node.flush === "true") domElement.classList.add("flush");
      break;

    case "Spacer":
      domElement = document.createElement("div");
      domElement.className = "widget-spacer";
      break;

    default:
      console.warn(`Unknown AST node type: ${type}`);
  }

  return domElement;
}

// 간이 JSX 파서 및 데이터 바인딩 파이프라인
function compileJSXToHTML(jsxString, data) {
  // 0) React식 속성 바인딩(={expr})을 표준 XML 속성 규격(="{expr}")으로 변환하는 전처리 수행
  let normalizedJSX = jsxString.replace(/={([^}]+)}/g, '="{$1}"');

  // 1) 템플릿 중괄호 변수 {expression}를 데이터 바인딩 치환
  let processedJSX = normalizedJSX.replace(/{([^}]+)}/g, (match, expression) => {
    const cleanExpr = expression.trim();
    // 데이터 객체 깊은 경로(Dot-path) 지원 (예: user.name)
    const val = cleanExpr.split('.').reduce((obj, key) => (obj && obj[key] !== 'undefined') ? obj[key] : '', data);
    return val !== undefined ? val : '';
  });

  // 2) 브라우저 XML 파서로 파싱 (반드시 root 태그가 하나여야 함 - Card, ListView, Basic 등)
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(processedJSX, "application/xml");
  
  // XML 파싱 에러 검사
  const parseError = xmlDoc.querySelector("parsererror");
  if (parseError) {
    throw new Error("JSX 마크업 문법 에러: " + parseError.textContent);
  }

  // 3) XML 노드 트리를 돌면서 HTML DOM 객체 생성
  return convertXMLNodeToDOM(xmlDoc.documentElement, data);
}

function convertXMLNodeToDOM(xmlNode, data) {
  const tagName = xmlNode.tagName;
  let domElement = null;

  // AGENTS.md 컴포넌트 분기 처리
  switch (tagName) {
    case "Card":
      domElement = document.createElement("div");
      domElement.className = "floating-card";
      
      const cardSize = xmlNode.getAttribute("size") || "sm";
      domElement.classList.add(`size-${cardSize}`);

      const background = xmlNode.getAttribute("background");
      if (background) {
        domElement.style.background = background;
        domElement.style.color = "white"; // 글자색 가독성을 위해 흰색 강제 유도
      }

      // confirm / cancel 풋터가 속성으로 정의되어 있는지 체크
      const confirmLabel = xmlNode.getAttribute("confirmLabel");
      const confirmAction = xmlNode.getAttribute("confirmAction");
      const cancelLabel = xmlNode.getAttribute("cancelLabel");

      // 자식 컴포넌트들 재귀 렌더링
      Array.from(xmlNode.childNodes).forEach(child => {
        if (child.nodeType === 1) { // Element node
          domElement.appendChild(convertXMLNodeToDOM(child, data));
        }
      });

      // 카드 하단 풋터 렌더링
      if (confirmLabel || cancelLabel) {
        const footer = document.createElement("div");
        footer.className = "floating-card-footer";

        if (cancelLabel) {
          const cancelBtn = document.createElement("button");
          cancelBtn.className = "widget-button variant-outline";
          cancelBtn.innerText = cancelLabel;
          cancelBtn.onclick = () => domElement.remove();
          footer.appendChild(cancelBtn);
        }

        if (confirmLabel) {
          const confirmBtn = document.createElement("button");
          confirmBtn.className = "widget-button style-primary";
          confirmBtn.innerText = confirmLabel;
          confirmBtn.onclick = async () => {
            try {
              const title = data.video1_title || "추천 유튜브 영상";
              const videoUrl = data.video1_url || "https://youtube.com";
              
              const res = await fetch("/api/mcp-gateway", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: "telegram_send",
                  arguments: { title, videoUrl }
                })
              });
              const resData = await res.json();
              if (resData.success) {
                showToast(`"${title}" 텔레그램 전송 완료!`);
              } else {
                showToast("❌ 텔레그램 전송 실패: " + resData.error);
              }
            } catch (err) {
              showToast("❌ 텔레그램 연동 에러: " + err.message);
            }
          };
          footer.appendChild(confirmBtn);
        }
        domElement.appendChild(footer);
      }
      break;

    case "ListView":
      domElement = document.createElement("div");
      domElement.className = "widget-listview";
      
      Array.from(xmlNode.childNodes).forEach(child => {
          if (child.nodeType === 1) {
            domElement.appendChild(convertXMLNodeToDOM(child, data));
          }
        });
      break;

    case "ListViewItem":
      domElement = document.createElement("div");
      domElement.className = "widget-listview-item";
      
      Array.from(xmlNode.childNodes).forEach(child => {
          if (child.nodeType === 1) {
            domElement.appendChild(convertXMLNodeToDOM(child, data));
          }
        });
      break;

    case "Box":
    case "Row":
    case "Col":
      domElement = document.createElement("div");
      domElement.className = `widget-${tagName.toLowerCase()}`;
      
      // align, justify 정렬 속성 매핑
      const align = xmlNode.getAttribute("align");
      const justify = xmlNode.getAttribute("justify");
      const gap = xmlNode.getAttribute("gap");

      if (align) domElement.style.alignItems = align === "start" ? "flex-start" : align === "end" ? "flex-end" : align;
      if (justify) domElement.style.justifyContent = justify === "space-between" ? "space-between" : justify === "center" ? "center" : justify;
      if (gap) domElement.style.gap = `${gap * 0.25}rem`;

      // Col이고 align="center"일 때 자식 글자들도 가운데 정렬되도록 상속 설정
      if (tagName === "Col" && align === "center") {
        domElement.style.textAlign = "center";
        domElement.style.width = "100%";
      }

      Array.from(xmlNode.childNodes).forEach(child => {
          if (child.nodeType === 1) {
            domElement.appendChild(convertXMLNodeToDOM(child, data));
          }
        });
      break;

    case "Title":
      domElement = document.createElement("h3");
      domElement.className = "widget-title";
      const tSize = xmlNode.getAttribute("size") || "md";
      domElement.classList.add(`size-${tSize}`);
      domElement.innerText = xmlNode.getAttribute("value") || "";

      // textAlign 속성 지원
      const tAlign = xmlNode.getAttribute("textAlign");
      if (tAlign) domElement.style.textAlign = tAlign;
      break;

    case "Text":
      domElement = document.createElement("p");
      domElement.className = "widget-text";
      const txtSize = xmlNode.getAttribute("size") || "md";
      const txtColor = xmlNode.getAttribute("color");
      const txtWeight = xmlNode.getAttribute("weight");

      domElement.classList.add(`size-${txtSize}`);
      if (txtColor) domElement.classList.add(`color-${txtColor}`);
      if (txtWeight === "bold") domElement.style.fontWeight = "700";

      // textAlign 속성 지원
      const txtAlign = xmlNode.getAttribute("textAlign");
      if (txtAlign) domElement.style.textAlign = txtAlign;

      domElement.innerText = xmlNode.getAttribute("value") || "";
      break;

    case "Caption":
      domElement = document.createElement("span");
      domElement.className = "widget-caption";
      domElement.innerText = xmlNode.getAttribute("value") || "";
      break;

    case "Badge":
      domElement = document.createElement("span");
      domElement.className = "widget-badge";
      domElement.innerText = xmlNode.getAttribute("label") || "";
      break;

    case "Image":
      domElement = document.createElement("img");
      domElement.className = "widget-image";
      domElement.setAttribute("src", xmlNode.getAttribute("src") || "");
      const imgSize = xmlNode.getAttribute("size");
      if (imgSize) {
        domElement.style.width = `${imgSize}px`;
        domElement.style.height = `${imgSize}px`;
      }
      // radius 속성 지원
      const radius = xmlNode.getAttribute("radius");
      if (radius) {
        domElement.style.borderRadius = radius === "md" ? "12px" : `${radius}px`;
      }
      break;

    case "Divider":
      domElement = document.createElement("div");
      domElement.className = "widget-divider";
      if (xmlNode.getAttribute("flush") === "true") domElement.classList.add("flush");
      break;

    default:
      // 정의되지 않은 intrinsics 태그 제한
      throw new Error(`🚫 알 수 없는 Widget UI 태그 사용: <${tagName}> (intrinsic div 등은 허용되지 않습니다)`);
  }

  return domElement;
}

// ==========================================
// 🎙️ 6. WebSocket 양방향 연결 제어
// ==========================================
async function toggleSession() {
  if (isRecording) {
    stopSession();
  } else {
    // 💡 브라우저 오디오 보호 락을 제스처 시점에 즉시 해제
    initAudioContextsOnGesture();
    await startSession();
  }
}

async function startSession() {
  try {
    // 💡 렉 없는 햅틱 UX: 오디오 버튼 터치 즉시 화면을 웰컴 로띠 상태로 전환하고 대기 타이머 시동
    resetUI(false);
    resetIdleTimer();

    // Orb 터치 즉시 활성 상태 전환 및 중복 클릭 방지
    if (statusIndicator) statusIndicator.className = "status-indicator connected";
    micBtn.disabled = true;

    // 🎙️ 모바일 웹앱 대응: 웰컴 상태로 진입한 채로 마이크 권한 요청 승인 팝업 노출
    if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === "function") {
      try {
        const permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // 권한 승인 시 즉시 임시 트랙 정지 (실제 녹음은 세션 시작 후 VAD로 가동)
        permissionStream.getTracks().forEach(track => track.stop());
      } catch (micErr) {
        console.warn("🎙️ 마이크 권한이 없거나 차단됨:", micErr);
        alert("마이크 사용 권한이 필요합니다. 브라우저 설정이나 메신저 우측 하단 메뉴에서 마이크를 허용해 주세요.");
        resetUI();
        return;
      }
    } else {
      console.warn("⚠️ navigator.mediaDevices.getUserMedia가 지원되지 않는 브라우저/환경입니다. 확인 생략.");
    }

    const response = await fetch("/api/session", { method: "POST" });
    const data = await response.json();

    if (data.error) {
      alert("세션 생성 실패: " + data.error);
      resetUI();
      return;
    }

    isMockMode = data.isMock;
    if (modeDisplay) modeDisplay.innerText = isMockMode ? "Mock Simulator" : "Gemini Live Session";

    if (isMockMode) {
      startMockSession();
    } else if (data.provider === "gemini" || data.geminiApiKey) {
      await startGeminiLiveSession(data.geminiApiKey);
    } else {
      await startRealtimeSession(data.value);
    }
  } catch (error) {
    console.error("Session start error:", error);
    alert("실시간 연결 에러: " + error.message);
    resetUI();
  }
}

// ----------------------------------------------------
// 🌟 1. Gemini Multimodal Live API (WebSocket) 엔진
// ----------------------------------------------------
async function startGeminiLiveSession(apiKey) {
  let keyToUse = apiKey;

  // 💡 로컬 스토리지에 사용자가 입력한 API 키가 있다면 우선 적용
  const userSavedKey = localStorage.getItem("GEMINI_API_KEY");
  if (userSavedKey && userSavedKey.trim()) {
    keyToUse = userSavedKey.trim();
  }

  if (!keyToUse || keyToUse.startsWith("mock-key")) {
    const inputKey = prompt("🔑 Google AI Studio 무료 Gemini API Key를 입력해 주세요:\n(무료 키를 입력하시면 브라우저에 저장되어 즉시 음성 대화가 시작됩니다)");
    if (inputKey && inputKey.trim()) {
      keyToUse = inputKey.trim();
      localStorage.setItem("GEMINI_API_KEY", keyToUse);
    } else {
      alert("❌ API Key 없이는 Gemini Live 음성 대화를 진행할 수 없습니다.");
      resetUI();
      return;
    }
  }

  console.log("🔌 [Gemini Live] Gemini Flash Live WebSocket 세션 연결 기동...");

  // 구글 공식 Multimodal Live API (BidiGenerateContent) v1alpha WebSocket
  const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${keyToUse}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = async () => {
    console.log("🔌 Gemini Flash Live WebSocket 연결 성공!");
    
    // 1. Setup 메시지 전송 (BidiGenerateContentSetup)
    const setupMessage = {
      setup: {
        model: "models/gemini-3.1-flash-live-preview",
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Puck"
              }
            }
          }
        },
        systemInstruction: {
          parts: [
            {
              text: `너는 사용자의 전문적인 유튜브 아카이빙 비서이자 트렌드 분석가야.
사용자가 말을 걸면 정중하고 자연스러운 한국어 음성으로 친절하게 대답해줘.
사용자가 유튜브 동영상 검색이나 추천을 요청하면 지체 없이 'youtube_search_videos' 툴을 호출해.
툴 호출이 성공하면 검색 결과를 참고해서 핵심 내용을 부드러운 한국어 음성으로 브리핑해줘.`
            }
          ]
        },
        tools: [
          {
            functionDeclarations: [
              {
                name: "youtube_search_videos",
                description: "사용자가 요청한 주제의 유튜브 동영상을 검색하여 3개의 비디오 카드를 화면에 표시합니다.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    query: {
                      type: "STRING",
                      description: "검색할 유튜브 키워드 (예: AI 에이전트, 백종원 레시피)"
                    }
                  },
                  required: ["query"]
                }
              },
              {
                name: "telegram_send",
                description: "유튜브 동영상 정보를 텔레그램으로 전송합니다.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    title: { type: "STRING", description: "동영상 제목" },
                    videoUrl: { type: "STRING", description: "동영상 URL" }
                  },
                  required: ["title", "videoUrl"]
                }
              },
              {
                name: "play_video",
                description: "화면에 노출된 3개 비디오 중 지정한 인덱스 번호(1, 2, 3)의 영상을 브라우저에서 재생합니다.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    index: { type: "INTEGER", description: "재생할 영상 인덱스 번호 (1, 2, 3)" }
                  },
                  required: ["index"]
                }
              }
            ]
          }
        ]
      }
    };
    ws.send(JSON.stringify(setupMessage));
    console.log("📤 [Gemini Live] setup 메시지 전송 완료");

    // 2. 마이크 음성 스트리밍 시작 (16kHz PCM16)
    await startMicCapture();
  };

  ws.onmessage = async (e) => {
    try {
      let data;
      if (e.data instanceof Blob) {
        const text = await e.data.text();
        data = JSON.parse(text);
      } else {
        data = JSON.parse(e.data);
      }

      resetIdleTimer();

      // A. Gemini 오디오 출력 처리
      if (data.serverContent?.modelTurn?.parts) {
        for (const part of data.serverContent.modelTurn.parts) {
          if (part.inlineData && part.inlineData.data) {
            isResponseActive = true;
            enqueueAudio(part.inlineData.data);
            if (statusIndicator) statusIndicator.className = "status-indicator active";
          }
        }
      }

      if (data.serverContent?.turnComplete) {
        isResponseActive = false;
        if (statusIndicator) statusIndicator.className = "status-indicator connected";
      }

      // B. Gemini Realtime Tool Use (Function Calling) 처리
      if (data.toolCall?.functionCalls) {
        for (const call of data.toolCall.functionCalls) {
          const { name, args, id } = call;
          console.log(`🎬 [Gemini Tool Call]: ${name}`, args, id);

          if (name === "youtube_search_videos") {
            showToast(`"${args.query}" 실시간 검색 중...`);
            try {
              const res = await fetch("/api/mcp-gateway", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "youtube_search_videos", arguments: args })
              });
              const result = await res.json();
              console.log("📡 [Gateway 응답]:", result);

              if (result.success && result.videos && result.videos.length > 0) {
                renderYoutubeWidget(args.query, result.videos);
              } else {
                renderSearchErrorWidget(args.query, result.error || "검색 결과를 찾지 못했습니다.");
              }

              // 🚀 즉시 toolResponse 반환 (Gemini Live 타임아웃 차단)
              const toolResp = {
                toolResponse: {
                  functionResponses: [
                    {
                      response: {
                        output: {
                          success: result.success,
                          videos: (result.videos || []).map((v, i) => ({
                            index: i + 1,
                            title: v.title,
                            channel: v.channelTitle,
                            duration: v.duration,
                            views: v.viewCount
                          }))
                        }
                      },
                      id: id
                    }
                  ]
                }
              };
              ws.send(JSON.stringify(toolResp));
              console.log("📤 [Gemini Live] toolResponse 반환 완료");
            } catch (err) {
              console.error("❌ 유튜브 검색 툴 실행 에러:", err);
            }
          } else if (name === "play_video") {
            const idx = parseInt(args.index, 10) - 1;
            if (window.currentContextVideos && window.currentContextVideos[idx]) {
              const video = window.currentContextVideos[idx];
              console.log(`🎬 [Play Video] ${idx + 1}번째 영상 재생 시도:`, video.title);
              launchYoutubeVideo(video);
              stopSession();
            }
            ws.send(JSON.stringify({
              toolResponse: {
                functionResponses: [
                  {
                    response: { output: { success: true, message: `Playing video ${args.index}` } },
                    id: id
                  }
                ]
              }
            }));
          } else if (name === "telegram_send") {
            const res = await fetch("/api/mcp-gateway", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: "telegram_send", arguments: args })
            });
            const resData = await res.json();
            if (resData.success) showToast(`"${args.title}" 텔레그램 전송 완료!`);
            ws.send(JSON.stringify({
              toolResponse: {
                functionResponses: [
                  {
                    response: { output: { success: resData.success } },
                    id: id
                  }
                ]
              }
            }));
          }
        }
      }
    } catch (err) {
      console.error("❌ Gemini WebSocket 이벤트 처리 에러:", err);
    }
  };

  ws.onerror = (err) => {
    console.error("❌ Gemini WebSocket 에러:", err);
    alert("Gemini Live 연결 에러가 발생했습니다.");
    stopSession();
  };

  ws.onclose = (e) => {
    console.log("🔌 Gemini WebSocket 종료:", e.code, e.reason);
    if (isRecording) stopSession();
  };

  isRecording = true;
  updateUIForConnectedState();
}

async function startRealtimeSession(clientToken) {
  // Grok 폴백
  const wsUrl = `wss://api.x.ai/v1/realtime?model=grok-voice-latest`;
  ws = new WebSocket(wsUrl, [`xai-client-secret.${clientToken}`]);
  ws.onopen = async () => {
    console.log("🔌 xAI Grok Realtime WebSocket 연결 성공!");
    await startMicCapture();
  };
  ws.onmessage = (e) => handleRealtimeEvent(JSON.parse(e.data));
  ws.onerror = () => stopSession();
  ws.onclose = () => { if (isRecording) stopSession(); };
  isRecording = true;
  updateUIForConnectedState();
}

// --- 마이크 캡처 → PCM16 base64 → Gemini Live / WebSocket 전송 ---
let micStream = null;
let micProcessor = null;
let micContext = null;
const TARGET_SAMPLE_RATE = 16000;

async function startMicCapture() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    alert("마이크 권한이 필요합니다: " + err.message);
    stopSession();
    return;
  }

  micContext = new AudioContext();
  const nativeSR = micContext.sampleRate;
  console.log(`🎤 브라우저 네이티브 sampleRate: ${nativeSR}Hz`);
  
  const source = micContext.createMediaStreamSource(micStream);
  micProcessor = micContext.createScriptProcessor(2048, 1, 1);

  micProcessor.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    if (welcomeAudio && !welcomeAudio.paused && !hasRenderedYoutubeWidget) {
      return;
    }
    
    const float32 = e.inputBuffer.getChannelData(0);
    const ratio = nativeSR / TARGET_SAMPLE_RATE;
    const downLen = Math.floor(float32.length / ratio);
    const pcm16 = new Int16Array(downLen);
    for (let i = 0; i < downLen; i++) {
      const srcIdx = Math.floor(i * ratio);
      const s = Math.max(-1, Math.min(1, float32[srcIdx]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const base64 = uint8ToBase64(new Uint8Array(pcm16.buffer));

    // Gemini Live 전용 realtimeInput 전송 규격
    ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [
          {
            mimeType: "audio/pcm",
            data: base64
          }
        ]
      }
    }));
  };

  source.connect(micProcessor);
  micProcessor.connect(micContext.destination);
  console.log(`🎤 Gemini Live 마이크 캡처 시작 (${nativeSR}Hz → ${TARGET_SAMPLE_RATE}Hz 다운샘플링 → WebSocket)`);
}

function stopMicCapture() {
  if (micProcessor) { micProcessor.disconnect(); micProcessor = null; }
  if (micContext) { micContext.close(); micContext = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
}

// --- base64 유틸리티 ---
function uint8ToBase64(uint8) {
  let binary = "";
  for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
  return btoa(binary);
}

function base64ToUint8(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

// --- 수신 오디오 재생 ---
let playbackCtx = null;
let grokAnalyser = null;
let playbackQueue = [];
let isPlaying = false;
let activeSource = null;

function enqueueAudio(base64Audio) {
  const bytes = base64ToUint8(base64Audio);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const pcm16 = new Int16Array(arrayBuffer);
  
  const float32 = new Float32Array(pcm16.length);
  for (let i = 0; i < pcm16.length; i++) {
    float32[i] = pcm16[i] / 32768.0;
  }

  if (!playbackCtx) {
    playbackCtx = new AudioContext({ sampleRate: 24000 });
    grokAnalyser = playbackCtx.createAnalyser();
    grokAnalyser.fftSize = 64;
  }

  if (playbackCtx.state === "suspended") {
    playbackCtx.resume();
  }

  const buffer = playbackCtx.createBuffer(1, float32.length, 24000);
  buffer.getChannelData(0).set(float32);
  
  playbackQueue.push(buffer);
  if (!isPlaying) {
    drainPlaybackQueue();
  }
}

function drainPlaybackQueue() {
  if (playbackQueue.length === 0) {
    isPlaying = false;
    return;
  }
  
  isPlaying = true;
  const buffer = playbackQueue.shift();
  
  activeSource = playbackCtx.createBufferSource();
  activeSource.buffer = buffer;
  activeSource.connect(playbackCtx.destination);
  if (grokAnalyser) {
    activeSource.connect(grokAnalyser);
  }
  
  const currentTime = playbackCtx.currentTime;
  if (nextPlaybackTime <= currentTime) {
    nextPlaybackTime = currentTime + 0.02;
  }
  
  activeSource.start(nextPlaybackTime);
  nextPlaybackTime += buffer.duration;
  
  activeSource.onended = () => {
    drainPlaybackQueue();
  };
}

function interruptPlayback() {
  console.log("🤫 오디오 정지");
  playbackQueue = [];
  nextPlaybackTime = 0;
  if (activeSource) {
    try { activeSource.stop(); } catch (e) {}
    activeSource = null;
  }
  isPlaying = false;
}

// --- WebSocket 이벤트 핸들러 ---
function handleRealtimeEvent(event) {
  // 💡 불필요한 과부하 방지: 매초 수십 번씩 쏟아지는 오디오/텍스트 델타 스트리밍 데이터는 제외하고 타이머 리셋
  if (event.type && !event.type.endsWith(".delta")) {
    resetIdleTimer();
  }

  // session.updated 확인
  if (event.type === "session.updated") {
    console.log("✅ session.updated 수신 — 설정 적용 성공!", event.session?.tools);
  }

  // session.created 확인
  if (event.type === "session.created") {
    console.log("✅ session.created 수신 — 세션 생성 성공!");
  }

  // 사용자의 실시간 음성 감지 시작 (GPT처럼 끼어들기 핵심 이벤트!)
  if (event.type === "input_audio_buffer.speech_started") {
    interruptPlayback();
    
    // 1. 기존 웰컴 카드 숨김
    if (welcomeCard) welcomeCard.classList.add("hidden");

    // 2. 이전 그록 말풍선의 커서 비활성화
    if (currentGrokBubble) {
      currentGrokBubble.classList.remove("typing-cursor");
      currentGrokBubble = null;
    }

    // 사용자 음성은 UI에 전사하지 않음 (음성 전용 모드)
    grokTranscriptText = "";
  }

  // 사용자가 말한 텍스트 전사(STT)가 확정되었을 때 (최초 온보딩 시에만 전사)
  if (event.type === "conversation.item.input_audio_transcription.completed") {
    const text = event.transcript || event.text;
    console.log("🎤 [User STT]", text);
    
    // 썸네일 노출 이전 최초 온보딩 시에만 전사 노출
    if (!hasRenderedYoutubeWidget && text && text.trim().length > 0) {
      if (!currentUserBubble) {
        currentUserBubble = createChatBubble("user");
        currentUserBubble.querySelector(".bubble-content").innerText = text;
      } else {
        const currentText = currentUserBubble.querySelector(".bubble-content").innerText;
        if (!currentText.includes(text)) {
          currentUserBubble.querySelector(".bubble-content").innerText = currentText + " " + text;
        }
      }
    }
  }

  // 그록의 실시간 텍스트 답변 자막 조각(Transcript Delta) 스트리밍 감지 (최초 온보딩 시에만 타이핑 노출)
  if (event.type === "response.audio_transcript.delta" || event.type === "response.output_audio_transcript.delta") {
    isResponseActive = true; // 💡 응답 생성 시작 감지
    if (typeof welcomeCard !== "undefined" && welcomeCard) welcomeCard.classList.add("hidden");
    
    // 그록이 응답을 시작하므로 유저 말풍선 묶음을 닫고 참조 초기화
    currentUserBubble = null;
    
    if (!hasRenderedYoutubeWidget && event.delta) {
      if (!currentGrokBubble) {
        currentGrokBubble = createChatBubble("grok", true);
      }
      typingQueue.push(...event.delta.split(""));
      if (!isTypingLoopRunning) {
        isTypingLoopRunning = true;
        runTypewriterLoop();
      }
    }
  }

  // 그록이 말하기를 마치고 텍스트 전사가 끝났을 때
  if (event.type === "response.audio_transcript.done" || event.type === "response.output_audio_transcript.done") {
    console.log("📝 [Grok Text Complete] 그록 음성 브리핑 조각 수신 완료.");
    if (currentGrokBubble) {
      currentGrokBubble.classList.remove("typing-cursor");
      currentGrokBubble = null;
    }
  }

  // xAI 오디오 delta 수신 → 재생 큐에 삽입 (xAI 이벤트명: response.output_audio.delta)
  if (event.type === "response.output_audio.delta" && event.delta) {
    isResponseActive = true; // 💡 오디오 스트리밍 출력 중
    enqueueAudio(event.delta);
    // 비주얼 피드백
    if (statusIndicator) statusIndicator.className = "status-indicator active";
  }

  // xAI 오디오 응답 완료 (response.output_audio.done)
  if (event.type === "response.output_audio.done") {
    console.log("🔊 오디오 응답 완료");
    isResponseActive = false; // 💡 응답 출력 완료
    if (statusIndicator) statusIndicator.className = "status-indicator connected";
  }

  // 에러 이벤트
  if (event.type === "error") {
    console.error("❌ xAI Realtime 에러:", event.error);
    const errMsg = event.error?.message || "";
    // 💡 취소 관련 및 활성 응답 없음 경고는 시스템상 당연한 현상이므로 alert창을 띄우지 않고 로깅 처리
    if (errMsg.includes("no active response") || errMsg.includes("cancellation") || errMsg.includes("cancel")) {
      console.log("🤫 [Ignored State Alert] 취소/응답 상태 무시 완료:", errMsg);
      return;
    }
    alert("❌ xAI 에러: " + (event.error?.message || JSON.stringify(event.error)));
  }

  // Function call 완료
  if (event.type === "response.function_call_arguments.done") {
    handleFunctionCall(event);
  }
}

async function handleFunctionCall(event) {
  const { call_id, name, arguments: argsString } = event;
  const args = JSON.parse(argsString);
  console.log(`🎬 [Tool Call]: ${name}`, args);

  if (name === "youtube_search_videos" && hasRenderedYoutubeWidget) {
    showToast(`"${args.query}" 검색 중...`);
  }

  // 💡 재생 툴은 백엔드 호출 없이 즉시 프론트엔드 단에서 링크를 열고 세션을 완전 차단/종료 처리
  if (name === "play_video") {
    const idx = parseInt(args.index, 10) - 1;
    if (window.currentContextVideos && window.currentContextVideos[idx]) {
      const video = window.currentContextVideos[idx];
      console.log(`🎬 [Play Video] ${idx + 1}번째 영상 재생 시도:`, video.title);
      
      launchYoutubeVideo(video);
      stopSession();
    }
    return;
  }

  // 백엔드 게이트웨이 호출
  const response = await fetch("/api/mcp-gateway", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, arguments: args })
  });
  const result = await response.json();
  console.log(`📡 [Gateway 응답]:`, result);

  // youtube_search_videos 처리
  if (name === "youtube_search_videos") {
    if (result.success && result.videos && result.videos.length > 0) {
      renderYoutubeWidget(args.query, result.videos);
    } else {
      renderSearchErrorWidget(args.query, result.error || "검색 결과를 찾을 수 없습니다.");
    }
  }

  // show_youtube_widget (fallback) 처리
  if (name === "show_youtube_widget") {
    const videos = args.videos || result.videos;
    const query = args.searchQuery || args.query;
    if (result.success && videos && videos.length > 0) {
      renderYoutubeWidget(query, videos);
    } else {
      renderSearchErrorWidget(query, result.error || "위젯 카드를 로드하지 못했습니다.");
    }
  }

  if (name === "telegram_send" && result.success) {
    showToast(`"${args.title}" 텔레그램 전송 완료!`);
  }

  // 함수 호출 결과를 모델에게 반환 (컨텍스트 절약: youtube 결과는 브리핑용 최소 정보만 전달)
  let outputPayload = result;
  if (name === "youtube_search_videos" && result.success && result.videos) {
    outputPayload = {
      success: true,
      videos: result.videos.map((v, i) => ({
        index: i + 1,
        title: v.title,
        channel: v.channelTitle,
        duration: v.duration,
        views: v.viewCount
      }))
    };
  }
  ws.send(JSON.stringify({
    type: "conversation.item.create",
    item: {
      type: "function_call_output",
      call_id: call_id,
      output: JSON.stringify(outputPayload)
    }
  }));
  ws.send(JSON.stringify({ type: "response.create" }));


  dataChannel.onmessage = async (e) => {
    try {
      const event = JSON.parse(e.data);

      if (event.type === "session.updated") {
        console.log("✅ session.updated 수신 — 툴 등록 성공!", event.session?.tools);
      }

      if (event.type === "error") {
        console.error("❌ Realtime 에러:", event.error);
        alert("❌ 에러: " + (event.error?.message || JSON.stringify(event.error)));
      }

      if (event.type === "response.function_call_arguments.done") {
        const { call_id, name, arguments: argsString } = event;
        const args = JSON.parse(argsString);
        console.log(`🎬 [Tool Call]: ${name}`, args);

        if (name === "youtube_search_videos" && hasRenderedYoutubeWidget) {
          showToast(`"${args.query}" 검색 중...`);
        }

        // WebRTC 채널용 play_video 툴 직접 처리
        if (name === "play_video") {
          const idx = parseInt(args.index, 10) - 1;
          if (window.currentContextVideos && window.currentContextVideos[idx]) {
            const video = window.currentContextVideos[idx];
            console.log(`🎬 [Play Video] ${idx + 1}번째 영상 재생 시도:`, video.title);
            
            launchYoutubeVideo(video);
            stopSession();
          }
          return;
        }

        const response = await fetch("/api/mcp-gateway", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, arguments: args })
        });
        const result = await response.json();
        console.log(`📡 [Gateway 응답]:`, result);

        if (name === "youtube_search_videos") {
          if (result.success && result.videos && result.videos.length > 0) {
            renderYoutubeWidget(args.query, result.videos);
          } else {
            renderSearchErrorWidget(args.query, result.error || "검색 결과를 찾을 수 없습니다.");
          }
        }

        if (name === "show_youtube_widget") {
          const videos = args.videos || result.videos;
          const query = args.searchQuery || args.query;
          if (result.success && videos && videos.length > 0) {
            renderYoutubeWidget(query, videos);
          } else {
            renderSearchErrorWidget(query, result.error || "위젯 카드를 로드하지 못했습니다.");
          }
        }

        if (name === "telegram_send" && result.success) {
          showToast(`"${args.title}" 텔레그램 전송 완료!`);
        }

        // WebRTC 컨텍스트 절약: youtube 결과는 브리핑용 최소 정보만 전달
        let rtcOutputPayload = result;
        if (name === "youtube_search_videos" && result.success && result.videos) {
          rtcOutputPayload = {
            success: true,
            videos: result.videos.map((v, i) => ({
              index: i + 1,
              title: v.title,
              channel: v.channelTitle,
              duration: v.duration,
              views: v.viewCount
            }))
          };
        }
        dataChannel.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: call_id,
            output: JSON.stringify(rtcOutputPayload)
          }
        }));
        dataChannel.send(JSON.stringify({ type: "response.create" }));
      }
    } catch (err) {
      console.error("❌ 데이터 채널 에러:", err);
    }
  };
}

// 📱 유튜브 앱 직접 기동 및 팝업 우회 유틸리티 (PWA 완벽 대응)
function launchYoutubeVideo(video) {
  const videoIdMatch = (video.videoUrl || video.url || "").match(/(?:v=|\/embed\/|\/watch\?v=|\/vi\/|youtu\.be\/|\/v\/)([a-zA-Z0-9_-]{11})/);
  const videoId = videoIdMatch ? videoIdMatch[1] : (video.id || "");
  
  if (videoId) {
    const deepLink = `youtube://www.youtube.com/watch?v=${videoId}`;
    const webFallbackUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    console.log(`📡 [Deep Link] 유튜브 네이티브 앱 연동 시도: ${deepLink}`);
    
    // 모바일 PWA 환경에서 팝업 차단기를 완전히 우회하고 앱을 직접 기동하기 위해 location.href를 사용합니다.
    window.location.href = deepLink;
    
    // 유튜브 앱이 깔려있지 않은 브라우저 환경 대응을 위한 1.5초 타이머 웹 폴백
    setTimeout(() => {
      if (document.visibilityState === "visible") {
        console.log("⚠️ 유튜브 앱 미동작 감지. 웹 브라우저 주소로 폴백 이동합니다.");
        window.location.href = webFallbackUrl;
      }
    }, 1500);
  } else {
    const fallbackUrl = video.videoUrl || video.url || "https://www.youtube.com";
    window.location.href = fallbackUrl;
  }
}

// 툴 호출 결과로 유튜브 위젯 카드를 직접 DOM 렌더링 (JSX 컴파일러 완전 우회)
function renderYoutubeWidget(query, videos) {
  if (!videos || videos.length === 0) {
    console.warn("⚠️ renderYoutubeWidget: 비디오 데이터 없음");
    return;
  }

  // 💡 인덱스 기반 개별 비디오 음성 재생 툴 및 타이핑 카드 치환을 위해 글로벌 캐시에 바인딩
  window.currentContextVideos = videos;

  // 유튜브 위젯이 성공적으로 노출되었으므로 온보딩 완료 처리 (이후 화면 STT 전사 및 말풍선은 생략됨)
  hasRenderedYoutubeWidget = true;

  // 💡 최초 온보딩용 WebSpeech 인식을 정지하고 자원 해제
  if (recognition) {
    try { recognition.abort(); } catch (e) {}
    recognition = null;
  }

  // 💡 본격적으로 실시간 양방향 PCM 마이크 캡처를 기동하여 대화 및 끼어들기 전환
  if (ws && ws.readyState === WebSocket.OPEN && !micStream) {
    startMicCapture();
  }

  console.log(`🎬 renderYoutubeWidget 호출: query="${query}", ${videos.length}개 비디오`);

  // 웰컴 카드 숨김
  if (welcomeCard) welcomeCard.classList.add("hidden");

  // 위젯 카드 컨테이너 생성
  const card = document.createElement("div");
  card.className = "floating-card youtube-card";
  card.style.cssText = "padding: 0.9rem; animation: springIn 0.6s var(--apple-easing) forwards; border: 1.5px solid rgba(255,255,255,0.08); background: var(--card-bg); backdrop-filter: blur(40px); box-shadow: var(--apple-shadow); border-radius: 24px;";

  // 헤더
  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;";
  header.innerHTML = `
    <h3 style="margin:0; font-size:1.05rem; font-weight:800; color:var(--text-primary); letter-spacing:-0.5px; font-family:var(--font-sans);">추천 유튜브 영상</h3>
    <span style="background:rgba(255, 255, 255, 0.06); border:1px solid rgba(255, 255, 255, 0.12); color:var(--text-primary); padding:4px 14px; border-radius:20px; font-size:0.7rem; font-weight:700; font-family:var(--font-sans);">${query || '추천'}</span>
  `;
  card.appendChild(header);

  // 구분선
  const divider = document.createElement("hr");
  divider.style.cssText = "border:none; height:1px; background:rgba(255,255,255,0.05); margin:0 0 0.6rem 0;";
  card.appendChild(divider);

  // 비디오 리스트
  videos.forEach((video, i) => {
    const item = document.createElement("div");
    item.style.cssText = "display:flex; flex-direction:column; padding:0; cursor:pointer; border-radius:20px; transition: all 0.8s var(--apple-easing); border: 1px solid transparent; margin-bottom: 0px; opacity: 0; transform: translateY(20px);";
    
    // 순차적 등장 애니메이션 (이전 롤백 버전 - 빠른 즉시 팝)
    setTimeout(() => {
      item.style.opacity = "1";
      item.style.transform = "translateY(0)";
    }, 100 + (i * 150));

    // 호버 애니메이션 ( Apple TV+ 포스터 팝 효과)
    item.onmouseover = () => {
      item.style.background = "rgba(255, 255, 255, 0.04)";
      item.style.borderColor = "rgba(255, 255, 255, 0.1)";
      item.style.boxShadow = "0 12px 30px rgba(0, 0, 0, 0.35)";
      const img = item.querySelector("img");
      if (img) img.style.transform = "scale(1.03)";
    };
    item.onmouseout = () => {
      item.style.background = "transparent";
      item.style.borderColor = "transparent";
      item.style.boxShadow = "none";
      const img = item.querySelector("img");
      if (img) img.style.transform = "scale(1)";
    };

    const thumbUrl = video.thumbnailUrl || video.thumbnail || `https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg`;
    const videoUrl = video.videoUrl || video.url || "https://www.youtube.com";
    const title = (video.title || `영상 ${i + 1}`)
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
    const channel = video.channel || video.channelTitle || "YouTube";
    const duration = video.duration || "5:00";
    const publishedTime = video.publishedTime || "최근";
    const viewCount = video.viewCount || "추천 영상";

    // 카카오톡에 맞춤 전달하기 위해 문자열 이스케이프 처리
    const escapedTitle = title.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    const escapedUrl = videoUrl.replace(/'/g, "\\'");

    item.innerHTML = `
      <!-- 컴팩트 썸네일 -->
      <div style="position:relative; width:100%; aspect-ratio:16/9; border-radius:14px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.35); flex-shrink:0;">
        <img src="${thumbUrl}" alt="${title}" 
             style="width:100%; height:100%; object-fit:cover; background:#07080e; transition: transform 0.5s var(--apple-easing);"
             onerror="this.src='https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg'" />
        
        <!-- 좌상단 텔레그램 공유 버튼 -->
        <button class="telegram-share-btn" 
                style="position:absolute; left:8px; top:8px; width:28px; height:28px; border-radius:50%; background:#0088cc; color:#ffffff; border:none; display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:0.75rem; box-shadow:0 2px 8px rgba(0,0,0,0.4); z-index:20; transition: all 0.2s var(--apple-easing);" 
                title="텔레그램으로 공유" 
                onclick="event.stopPropagation(); window.shareVideoToTelegram(this, '${escapedTitle}', '${escapedUrl}');">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-right: 1px; margin-top: 1px;"><path d="M9.78 18.65l.28-4.28 7.68-6.94c.33-.29-.07-.45-.51-.16L7.69 13.2l-4.14-1.3c-.9-.28-.92-.9.19-1.34L19.82 4.2c.74-.27 1.39.18 1.15 1.25L18.3 18.23c-.22 1.07-.85 1.33-1.75.82l-4.13-3.05-1.99 1.92c-.22.22-.4.4-.82.4z" fill="#ffffff"/></svg>
        </button>

        <!-- 우하단 재생 시간 뱃지 -->
        <span style="position:absolute; right:8px; bottom:8px; background:rgba(0,0,0,0.8); color:#fff; font-size:0.6rem; font-weight:700; padding:3px 7px; border-radius:5px; font-family:'JetBrains Mono',monospace; letter-spacing:-0.2px; backdrop-filter:blur(4px);">
          ${duration}
        </span>
      </div>
      <!-- 하단 메타 정보 -->
      <div style="width:100%; padding:6px 4px 0; font-family:var(--font-sans);">
        <div style="font-size:0.82rem; font-weight:700; color:var(--text-primary); line-height:1.35; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; overflow:hidden; letter-spacing:-0.3px;">
          ${title}
        </div>
        <div style="font-size:0.68rem; color:var(--text-secondary); display:flex; align-items:center; gap:5px; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500;">
          <span style="font-weight:700; color:var(--accent-mint);">${channel}</span>
          <span style="color:rgba(255,255,255,0.15);">•</span>
          <span>${viewCount}</span>
          <span style="color:rgba(255,255,255,0.15);">•</span>
          <span>${publishedTime}</span>
        </div>
      </div>
    `;

    item.onclick = () => {
      launchYoutubeVideo(video);
      stopSession();
    };
    card.appendChild(item);

    // 비디오 사이 구분선 (마지막 제외)
    if (i < videos.length - 1) {
      const sep = document.createElement("hr");
      sep.style.cssText = "border:none; height:1px; background:rgba(255,255,255,0.05); margin:6px 0;";
      card.appendChild(sep);
    }
  });

  // 카드 DOM에 추가
  cardStack.appendChild(card);

  // 스크롤 하단 자동 이동
  const scrollArea = document.querySelector(".card-display-area");
  if (scrollArea) {
    scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
  }

  console.log("✅ 유튜브 위젯 카드 렌더링 완료!");
}

function showOnboardingGrokBubble() {
  if (welcomeCard) welcomeCard.classList.add("hidden");
  
  currentGrokBubble = createChatBubble("grok", true);
  
  const text = `안녕하세요! Youtube Finder입니다. 다음과 같이 명령하시면 실시간 유튜브 영상을 검색해 드릴 수 있습니다.\n\n• "최근 손흥민 축구 경기 보여줘"\n• "맛있는 백종원 김치찌개 레시피 추천해줘"\n• "AI 코딩 어시스턴트 관련 트렌드 알아봐줘"`;
  
  const contentEl = currentGrokBubble.querySelector(".bubble-content");
  contentEl.innerHTML = ""; // 💡 타이핑 시작 전 로딩용 점(...) 엘리먼트를 소거하여 공백 정렬 버그 해결!
  
  // 💡 커스텀 타이핑 루프 기동 (타이핑 중간에 welcome.mp3 연동)
  let charIdx = 0;
  const totalLen = text.length;
  const midPoint = Math.floor(totalLen / 2);
  let audioPlayed = false;

  const interval = setInterval(() => {
    if (!isRecording) {
      clearInterval(interval);
      return;
    }
    
    if (charIdx < totalLen) {
      contentEl.innerText += text[charIdx];
      
      // 💡 텍스트 타이핑이 중간쯤(50%) 진행되었을 때 웰컴 음성 MP3를 자연스럽게 겹쳐서 재생!
      if (charIdx >= midPoint && !audioPlayed) {
        audioPlayed = true;
        if (welcomeAudio) {
          welcomeAudio.muted = false;
          welcomeAudio.play().catch(err => {
            console.warn("웰컴 재생 실패:", err);
            // 오디오 재생 실패 시 사용자가 입력하지 못하고 대기 상태에 빠지는 것을 막기 위해 마이크 즉시 활성화
            if (ws && ws.readyState === WebSocket.OPEN) {
              const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
              if (!SpeechRecognition) {
                startMicCapture();
              } else {
                startOnboardingSpeechRecognition();
              }
            }
          });
        }
      }
      
      charIdx++;
      const scrollArea = document.querySelector(".card-display-area");
      if (scrollArea) scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
    } else {
      clearInterval(interval);
      currentGrokBubble.classList.remove("typing-cursor");
      currentGrokBubble = null;
    }
  }, 40); // 글자당 40ms 속도
}

// 실시간 검색 실패 시 표출하는 재시도/가이드 에러 카드 렌더러
function renderSearchErrorWidget(query, errorMessage) {
  console.log(`🎬 renderSearchErrorWidget 호출: query="${query}", error="${errorMessage}"`);

  // 웰컴 카드 숨김
  if (welcomeCard) welcomeCard.classList.add("hidden");

  // 실패 카드 생성
  const card = document.createElement("div");
  card.className = "floating-card search-error-card";
  card.style.cssText = "padding: 1.2rem; border-left: 4px solid #fa709a; background: #fff; animation: fadeInUp 0.5s ease;";

  // 실패 정보 구성
  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
      <h3 style="margin:0; font-size:0.95rem; font-weight:700; color:#fa709a; display:flex; align-items:center; gap:6px;">
        ⚠️ 실시간 검색 실패
      </h3>
      <span style="background:#f1f1f1; color:#666; padding:2px 8px; border-radius:20px; font-size:0.68rem; font-weight:600;">
        ${query || '미지정'}
      </span>
    </div>
    <div style="font-size:0.82rem; color:#4a4a5a; line-height:1.45; margin-bottom:0.8rem;">
      ${errorMessage}
    </div>
    <div style="background:#fffafb; border:1px dashed rgba(250,112,154,0.3); border-radius:8px; padding:8px; font-size:0.75rem; color:#fa709a; font-weight:600; text-align:center;">
      💡 아래 마이크 버튼을 탭하고 다른 검색어로 다시 요청해 보세요!
    </div>
  `;

  cardStack.appendChild(card);

  // 스크롤 하단 자동 이동
  const scrollArea = document.querySelector(".card-display-area");
  if (scrollArea) {
    scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
  }
}

// ⏰ 무반응 세션 자동 종료 타이머 기동 (사용 요금 절약용 안전장치)
function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  
  // 15초 동안 무반응이면 마이크를 켜둔 상태로 대기하며 불필요한 VAD 요금이 발생하는 것을 방지하기 위해 자동 세션 차단
  idleTimer = setTimeout(() => {
    if (isRecording) {
      console.log("⏰ [Idle Timeout] 15초 동안 대화가 없어 마이크 세션을 자동 차단합니다.");
      showToast("대기 시간이 초과되어 대화가 자동 종료되었습니다.");
      stopSession();
    }
  }, 15000);
}

function stopSession() {
  console.log("🔌 세션 종료 절차를 즉시 가동합니다...");
  
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }

  if (isMockMode) {
    stopMockSession();
    return;
  }
  
  // 1. 마이크 입력 중지
  stopMicCapture();

  // WebSpeech API 리소스 해제
  if (recognition) {
    try {
      recognition.abort();
    } catch (e) {}
    recognition = null;
  }

  // 2. 스피커 출력 즉시 차단 & 큐 리셋
  interruptPlayback();

  // 3. WebSocket 닫기
  if (ws) {
    try {
      ws.close();
    } catch (e) {
      // 이미 닫힌 상태 무시
    }
    ws = null;
  }

  // 4. 기존 WebRTC 및 잔여 오디오 컨텍스트 클로즈
  if (pc) { pc.close(); pc = null; }
  if (dataChannel) { dataChannel.close(); dataChannel = null; }
  if (audioContext) { 
    try {
      audioContext.close();
    } catch (e) {}
    audioContext = null; 
  }

  isRecording = false;
  resetUI(hasRenderedYoutubeWidget);
  console.log("🔌 세션 종료 완료");
}

function updateUIForConnectedState() {
  if (statusIndicator) statusIndicator.className = "status-indicator connected";
  cancelBtn.classList.remove("hidden");
  if (typeof chatInput !== "undefined" && chatInput) chatInput.placeholder = "대화 중...";
  if (micBtn) micBtn.disabled = false;
  
  // 💡 연결 즉시 로띠 로고 및 웰컴 로비 카드를 가려 챗 및 비주얼라이저 시야를 확보
  if (welcomeCard) welcomeCard.classList.add("hidden");
}

function resetUI(keepCards = false) {
  if (statusIndicator) statusIndicator.className = "status-indicator disconnected";
  cancelBtn.classList.add("hidden");
  if (typeof chatInput !== "undefined" && chatInput) chatInput.placeholder = "음성 비서에게 물어보기";
  if (micBtn) micBtn.disabled = false;
  if (typeof modeDisplay !== "undefined" && modeDisplay) modeDisplay.innerText = "Mock Mode";

  // 💡 완전히 첫 리셋 상태면 웰컴 로비 카드와 로띠를 다시 활성화
  if (!keepCards && welcomeCard) {
    welcomeCard.classList.remove("hidden");
  }

  // 말풍선 및 타이핑 큐 초기화
  currentUserBubble = null;
  currentGrokBubble = null;
  typingQueue = [];
  isTypingLoopRunning = false;
  grokTextFinished = false;
  grokTranscriptText = "";
  
  if (!keepCards) {
    hasRenderedYoutubeWidget = false;
  }

  // 카드 스택을 비우고 웰컴 카드 복구 (keepCards가 false일 때만 카드 클리어)
  if (!keepCards && cardStack) {
    cardStack.innerHTML = "";
    if (welcomeCard) {
      cardStack.appendChild(welcomeCard);
      welcomeCard.classList.remove("hidden");
    }
    if (mapCard) {
      cardStack.appendChild(mapCard);
      mapCard.classList.add("hidden");
    }
  }
}

// 브라우저 오디오 보안 차단(Autoplay Block) 우회를 위한 온제스처 활성화 함수
function initAudioContextsOnGesture() {
  if (!playbackCtx) {
    playbackCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
    grokAnalyser = playbackCtx.createAnalyser();
    grokAnalyser.fftSize = 64;
  }
  if (playbackCtx.state === "suspended") {
    playbackCtx.resume();
  }

  // 무음 버퍼 강제 재생을 통한 디바이스 오디오 하드웨어 락 해제
  const buffer = playbackCtx.createBuffer(1, 1, 22050);
  const source = playbackCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(playbackCtx.destination);
  source.start(0);

  // 💡 iOS Safari 대응: 동기 제스처 이벤트 내에서 1px 크기의 완전 무음 오디오를 임시 재생하여 브라우저의 미디어 재생 제약(Autoplay Block)을 무소음으로 완전히 잠금 해제합니다.
  const dummyAudio = new Audio("data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA");
  dummyAudio.play().catch(e => {
    console.log("🔊 iOS Audio Whitelist unlocked:", e.message);
  });
}

// 💬 온보딩 대화방 말풍선 카드 렌더링 함수
function createChatBubble(role, isTyping = false) {
  if (welcomeCard) welcomeCard.classList.add("hidden");

  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;
  
  const speaker = document.createElement("div");
  speaker.className = "bubble-speaker";
  speaker.innerText = role === "user" ? "YOU" : "GROK";
  bubble.appendChild(speaker);

  const content = document.createElement("div");
  content.className = "bubble-content";
  if (role === "grok" && isTyping) {
    content.innerHTML = `<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
  }
  bubble.appendChild(content);

  cardStack.appendChild(bubble);

  // 스크롤 영역 하단 자동 이동
  const scrollArea = document.querySelector(".card-display-area");
  if (scrollArea) {
    scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
  }

  return bubble;
}




// 7. 실시간 맵 마킹 추가 (음성 시나리오용)
function addPlaceToRoute(place) {
  if (travelPath.some(p => p.name === place.name)) return;

  travelPath.push(place);

  if (welcomeCard) welcomeCard.classList.add("hidden");
  if (mapCard) mapCard.classList.remove("hidden");

  // 카드 렌더링은 에디터 컴파일러와는 별개로, 맵 전용 플로팅 카드로 생성
  const card = document.createElement("div");
  card.className = "floating-card timeline-card";
  card.innerHTML = `
    <div class="card-image-box">
      <img src="${place.image}" alt="${place.name}">
    </div>
    <div class="card-info">
      <h3 class="card-title">${place.name}</h3>
      <div class="card-meta">
        <span class="card-rating">⭐ ${place.rating}</span>
        <span class="card-index">Route #${travelPath.length}</span>
      </div>
    </div>
  `;

  card.addEventListener("click", () => {
    focusMapOn(place.lat, place.lng);
  });

  cardStack.appendChild(card);
  
  const scrollArea = document.querySelector(".card-display-area");
  scrollArea.scrollTo({
    top: scrollArea.scrollHeight,
    behavior: 'smooth'
  });

  if (mapInstance) {
    const latlng = new kakao.maps.LatLng(place.lat, place.lng);
    const marker = new kakao.maps.Marker({
      position: latlng,
      map: mapInstance
    });
    mapMarkers.push(marker);

    const infowindow = new kakao.maps.InfoWindow({
      content: `<div style="padding:5px;font-size:11px;color:#111;font-weight:700;">${place.name}</div>`
    });
    infowindow.open(mapInstance, marker);

    const path = polylineInstance.getPath();
    path.push(latlng);
    polylineInstance.setPath(path);

    mapInstance.panTo(latlng);
  } else {
    updateMockMapSVG();
  }
}

function updateMockMapSVG() {
  const svg = document.getElementById("mock-svg-path");
  if (!svg) return;
  
  svg.innerHTML = `
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0, 0, 0, 0.04)" stroke-width="1"/>
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#grid)" />
    <circle cx="50%" cy="50%" r="50" stroke="rgba(74, 141, 248, 0.08)" stroke-width="1.5" fill="none"/>
    <text x="15" y="25" fill="rgba(0, 0, 0, 0.15)" font-size="10" font-weight="700">MOCK TRAVEL MAP</text>
  `;

  const width = svg.clientWidth || 300;
  const height = svg.clientHeight || 220;

  let points = [];
  travelPath.forEach((place, index) => {
    const x = ((place.lng - 129.02) / 0.11) * width;
    const y = height - ((place.lat - 35.07) / 0.10) * height;
    points.push({ x, y, name: place.name });

    svg.innerHTML += `
      <g style="cursor:pointer;" onclick="focusMockPlace(${index})">
        <circle cx="${x}" cy="${y}" r="8" fill="#4a8df8" filter="drop-shadow(0 0 3px rgba(74,141,248,0.5))"/>
        <circle cx="${x}" cy="${y}" r="3" fill="#ffffff" />
        <text x="${x + 12}" y="${y + 4}" fill="#1e293b" font-size="9" font-weight="700">${index + 1}. ${place.name}</text>
      </g>
    `;
  });

  if (points.length > 1) {
    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      pathD += ` L ${points[i].x} ${points[i].y}`;
    }
    
    const pathElement = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathElement.setAttribute("d", pathD);
    pathElement.setAttribute("fill", "none");
    pathElement.setAttribute("stroke", "#4a8df8");
    pathElement.setAttribute("stroke-width", "2.5");
    pathElement.setAttribute("stroke-dasharray", "4,4");
    svg.insertBefore(pathElement, svg.firstChild);
  }
}

function focusMapOn(lat, lng) {
  if (mapInstance) {
    const latlng = new kakao.maps.LatLng(lat, lng);
    mapInstance.panTo(latlng);
  }
}

// 8. 프리미엄 네온 앰비언트 사인파(Neon Ambient Sine Wave) 오디오 비주얼라이저
let visualizerCtx = null;
let wavePhase = 0;
let currentVolume = 0;
let animationFrameId = null;

function initVisualizer() {
  visualizerCtx = visualizerCanvas.getContext("2d");
  resizeVisualizer();
  window.addEventListener("resize", resizeVisualizer);
  // 최초 잔잔한 유휴상태 파형 드로잉 루프 가동
  startVisualizerLoop();
}

function resizeVisualizer() {
  if (!visualizerCanvas) return;
  visualizerCanvas.width = visualizerCanvas.offsetWidth * window.devicePixelRatio;
  visualizerCanvas.height = visualizerCanvas.offsetHeight * window.devicePixelRatio;
  if (visualizerCtx) {
    visualizerCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }
}

function setupAudioContext(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 64; 
  source.connect(analyser);

  syncVolumeValue();
}

function syncVolumeValue() {
  if (!analyser || !isRecording) {
    currentVolume = 0;
    return;
  }

  requestAnimationFrame(syncVolumeValue);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyser.getByteFrequencyData(dataArray);

  let sum = 0;
  for (let i = 0; i < bufferLength; i++) {
    sum += dataArray[i];
  }
  // 0 ~ 1.0 범위로 정규화
  currentVolume = (sum / bufferLength) / 255;
}

let smoothVolume = 0; // 유체 댐핑용 부드러운 볼륨 값
const smoothDataArray = new Float32Array(64); // 파동 부드러움 보정용 배열

function startVisualizerLoop() {
  function drawFrame() {
    animationFrameId = requestAnimationFrame(drawFrame);
    if (!visualizerCtx || !visualizerCanvas) return;

    const w = visualizerCanvas.width / window.devicePixelRatio;
    const h = visualizerCanvas.height / window.devicePixelRatio;
    visualizerCtx.clearRect(0, 0, w, h);

    const bufferLength = 64;
    const dataArray = new Uint8Array(bufferLength);
    
    let activeAnalyser = null;
    
    // 1. 듀얼 오디오 싱크: 마이크가 켜져 있으면 마이크를, 그록이 말하는 중이면 그록 분석기를 타겟팅
    if (analyser && isRecording) {
      activeAnalyser = analyser;
    } else if (grokAnalyser && isPlaying) {
      activeAnalyser = grokAnalyser;
    }

    let targetVolume = 0;

    if (activeAnalyser) {
      activeAnalyser.getByteTimeDomainData(dataArray);
      
      // 주파수 실시간 볼륨 진폭 측정
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        const val = (dataArray[i] / 128.0) - 1.0;
        sum += val * val;
      }
      targetVolume = Math.min(Math.sqrt(sum / bufferLength) * 2.2, 1.0);
    } else if (isMockMode && typeof currentVolume !== "undefined") {
      // 시뮬레이터 모드 가상 볼륨 연동
      targetVolume = Math.min(currentVolume * 4.0, 1.0);
    } else {
      // 대기(Idle) 상태 시 미세 호흡량
      targetVolume = 0.05;
    }

    // 2. 물리 유체 선형 보간 (Fluid Lerp): 반응 속도를 약간 높여 더 역동적이게 만듦
    smoothVolume = smoothVolume * 0.90 + targetVolume * 0.10;
    
    // 목소리 크기에 따라 파동의 흐름 속도를 동적으로 가속 (말할 때 흐름이 빨라져 역동적임)
    wavePhase += 0.018 + smoothVolume * 0.04;

    // 3개 레이어의 파동 설정 (선 두께, 색상, 위상차, 진폭 배율, 주파수 배율)
    let waveConfigs = [];
    const hue = (wavePhase * 35) % 360; // 💡 서서히 부드럽게 색상 순환하는 HSL 레이저쇼 베이스

    if (isRecording) {
      // 💡 활성화 (Connected) 상태: 글로우 효과와 함께 끊임없이 요동치며 변하는 영롱한 레이저쇼 컬러 레이어
      visualizerCtx.shadowBlur = 18;
      visualizerCtx.shadowColor = `hsla(${hue}, 100%, 60%, 0.7)`;

      waveConfigs = [
        { width: 2.8, color: `hsla(${hue}, 100%, 65%, 0.9)`, phaseShift: 0, amp: 1.35, freqMult: 0.12 },
        { width: 1.8, color: `hsla(${(hue + 75) % 360}, 100%, 60%, 0.55)`, phaseShift: 2.3, amp: 0.9, freqMult: 0.15 },
        { width: 1.0, color: `hsla(${(hue + 150) % 360}, 100%, 55%, 0.25)`, phaseShift: 4.6, amp: 0.5, freqMult: 0.08 }
      ];
    } else {
      // 💡 비활성화 (Disconnected) 상태: 은은하게 숨쉬는 붉은색 주파수
      visualizerCtx.shadowBlur = 8;
      visualizerCtx.shadowColor = "rgba(255, 69, 58, 0.4)";

      waveConfigs = [
        { width: 1.6, color: "rgba(255, 69, 58, 0.75)", phaseShift: 0, amp: 0.25, freqMult: 0.06 },
        { width: 0.8, color: "rgba(255, 69, 58, 0.28)", phaseShift: 2.1, amp: 0.15, freqMult: 0.09 }
      ];
    }

    const sliceWidth = w / bufferLength;

    waveConfigs.forEach((cfg) => {
      visualizerCtx.beginPath();
      visualizerCtx.lineWidth = cfg.width;
      visualizerCtx.strokeStyle = cfg.color;
      visualizerCtx.lineCap = "round";

      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        // 가로축 양 끝 페이드 아웃 윈도우 처리 (가장자리 0, 중앙 극대화)
        const normalizedX = x / w;
        const envelope = Math.sin(normalizedX * Math.PI);
        
        // 메인 파동에 고주파 배음(Harmonic Ripple)을 혼합하여 단순하지 않고 유기적으로 일렁이는 곡선 생성 (역동적 굴곡)
        const waveOffset = Math.sin(i * cfg.freqMult + wavePhase + cfg.phaseShift) + 
                           0.26 * Math.sin(i * cfg.freqMult * 2.4 - wavePhase * 1.5 + cfg.phaseShift);
                           
        // 세로 진폭 곱연산 범위를 늘려(h * 0.38) 목소리 진폭 변화를 한층 더 다이내믹하게 표출
        const y = (h / 2) + 
          (waveOffset * (h * 0.38) * (0.05 + smoothVolume * 0.95) * envelope * cfg.amp);

        if (i === 0) {
          visualizerCtx.moveTo(x, y);
        } else {
          visualizerCtx.lineTo(x, y);
        }
        x += sliceWidth;
      }

      visualizerCtx.lineTo(w, h / 2);
      visualizerCtx.stroke();
    });
  }
  drawFrame();
}

// ==========================================
// 🧩 9. Mock 대화 에뮬레이터 (Premium UI 연동)
// ==========================================
let mockTimer1 = null;
let mockTimer2 = null;
let mockTimer3 = null;
let synth = window.speechSynthesis;

function startMockSession() {
  isRecording = true;
  updateUIForConnectedState();
  simulateOrbVolumeSync();

  // 온보딩 가이드 타이핑 노출
  showOnboardingGrokBubble();

  // 💡 음성 웰컴 대사는 showOnboardingGrokBubble의 타이핑 중간 과정에서 공통 재생하므로 여기서는 생략합니다.

  // 1단계: 6초 뒤 사용자 음성 인식(STT) 가상 전사 말풍선 렌더링
  mockTimer1 = setTimeout(() => {
    // 아직 썸네일 노출 이전이므로 화면 전사 노출
    const userBubble = createChatBubble("user");
    userBubble.querySelector(".bubble-content").innerText = "최근 손흥민 축구 경기 보여줘";
    
    speakMockVoice("최근 손흥민 선수 관련 영상이군요! 바로 검색해 드릴게요.");
  }, 6000);

  // 2단계: 9.5초 뒤 유튜브 위젯 썸네일 노출 (이 시점에서 hasRenderedYoutubeWidget = true 설정됨)
  mockTimer2 = setTimeout(() => {
    handleCompile();
  }, 9500);

  // 3단계: 16초 뒤 영상 브리핑 (썸네일 노출 이후이므로 화면 대화방 전사 생략)
  mockTimer3 = setTimeout(() => {
    speakMockVoice("첫 번째 영상은 손흥민 선수의 최근 출국 현장이고요, 두 번째는 경기 요약 하이라이트 영상입니다. 세 번째는 참고인 철회 관련 뉴스를 들고 왔습니다.");
  }, 16000);
}

function speakMockVoice(text) {
  if (synth && !synth.speaking) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 1.05;
    synth.speak(utterance);
  }
}

async function fetchMockPlaceData(query) {
  try {
    const res = await fetch("/api/mcp-gateway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "kakaomcp_search_place",
        arguments: { query: query }
      })
    });
    const result = await res.json();
    if (result.success) {
      addPlaceToRoute(result.place);
    }
  } catch (err) {
    console.error("Mock data fetch error:", err);
  }
}

function resetPathForMockChange() {
  travelPath = [];
  
  const timelineCards = cardStack.querySelectorAll(".timeline-card");
  timelineCards.forEach(card => card.remove());
  
  if (mapInstance) {
    mapMarkers.forEach(m => m.setMap(null));
    mapMarkers = [];
    polylineInstance.setPath([]);
  }
}

let mockVisualizerActive = false;
function simulateOrbVolumeSync() {
  mockVisualizerActive = true;

  function renderFrame() {
    if (!mockVisualizerActive) return;
    requestAnimationFrame(renderFrame);

    const isSpeaking = synth && synth.speaking;
    const amplitude = isSpeaking 
      ? Math.abs(Math.sin(Date.now() * 0.02) * 80 + Math.random() * 40)
      : Math.abs(Math.sin(Date.now() * 0.005) * 5); 

    // 가상 볼륨 수치를 3중 사인파 visualizer 전역 변수로 전달
    currentVolume = amplitude / 255;
  }

  renderFrame();
}

function stopMockSession() {
  mockVisualizerActive = false;
  isRecording = false;
  
  if (synth) synth.cancel();
  
  clearTimeout(mockTimer1);
  clearTimeout(mockTimer2);
  clearTimeout(mockTimer3);

  resetUI();
  
  if (welcomeCard) welcomeCard.classList.remove("hidden");
  if (mapCard) mapCard.classList.add("hidden");
  resetPathForMockChange();
}

window.focusMockPlace = function(index) {
  const place = travelPath[index];
  if (place) {
    console.log(`📌 가상 맵 장소 포커싱: ${place.name}`);
    alert(`장소 상세 정보: ${place.name}\n평점: ⭐ ${place.rating}`);
  }
};

window.shareVideoToTelegram = async (btn, title, videoUrl) => {
  const originalHTML = btn.innerHTML;
  btn.innerHTML = "⏳";
  btn.style.opacity = "0.7";
  btn.style.pointerEvents = "none";
  try {
    const res = await fetch("/api/mcp-gateway", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "telegram_send",
        arguments: {
          title: title,
          videoUrl: videoUrl
        }
      })
    });
    const result = await res.json();
    if (result.success) {
      btn.innerHTML = "✅";
      btn.style.background = "#30d158"; // iOS green
      btn.style.color = "#ffffff";
    } else {
      btn.innerHTML = "❌";
      btn.style.background = "#ff453a"; // iOS red
      btn.style.color = "#ffffff";
    }
  } catch (err) {
    btn.innerHTML = "❌";
    btn.style.background = "#ff453a"; // iOS red
    btn.style.color = "#ffffff";
  } finally {
    setTimeout(() => {
      btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" style="margin-right: 1px; margin-top: 1px;"><path d="M9.78 18.65l.28-4.28 7.68-6.94c.33-.29-.07-.45-.51-.16L7.69 13.2l-4.14-1.3c-.9-.28-.92-.9.19-1.34L19.82 4.2c.74-.27 1.39.18 1.15 1.25L18.3 18.23c-.22 1.07-.85 1.33-1.75.82l-4.13-3.05-1.99 1.92c-.22.22-.4.4-.82.4z" fill="#ffffff"/></svg>`;
      btn.style.background = "#0088cc"; // Telegram blue
      btn.style.color = "#ffffff";
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    }, 2000);
  }
};

// 🎥 emilkowalski/skills: 프론트엔드 스무스 타이핑 큐 엔진
function runTypewriterLoop() {
  if (!isTypingLoopRunning) return;

  const contentEl = currentGrokBubble ? currentGrokBubble.querySelector(".bubble-content") : null;
  
  if (!contentEl) {
    isTypingLoopRunning = false;
    return;
  }

  // 1. 큐에 출력할 글자가 존재할 때
  if (typingQueue.length > 0) {
    // 만약 첫 타이핑 시작 시 3점 바운스 로더가 남아있다면 제거
    const dotsEl = contentEl.querySelector(".typing-dots");
    if (dotsEl) {
      contentEl.innerHTML = ""; // 3점 로더 삭제
    }

    // 한 글자를 꺼내어 _rawText 버퍼에 추가
    const nextChar = typingQueue.shift();
    if (typeof currentGrokBubble._rawText === "undefined") {
      currentGrokBubble._rawText = "";
    }
    currentGrokBubble._rawText += nextChar;

    // 마크다운 파싱 로직 (**키워드** -> 네온 하이라이트 색상, \n -> <br>)
    let parsedText = currentGrokBubble._rawText
      .replace(/\*\*(.*?)\*\*/g, '<span style="color:#00f0ff; font-weight:800; text-shadow:0 0 10px rgba(0, 240, 255, 0.4);">$1</span>')
      .replace(/\n/g, '<br>');

    // [VIDEO_1], [VIDEO_2], [VIDEO_3] 인라인 치환 로직
    if (window.currentContextVideos && window.currentContextVideos.length > 0) {
      if (window.currentContextVideos[0]) {
        parsedText = parsedText.replace(/\[VIDEO_1\]/g, createVideoCardHTML(window.currentContextVideos[0], 0));
      }
      if (window.currentContextVideos[1]) {
        parsedText = parsedText.replace(/\[VIDEO_2\]/g, createVideoCardHTML(window.currentContextVideos[1], 1));
      }
      if (window.currentContextVideos[2]) {
        parsedText = parsedText.replace(/\[VIDEO_3\]/g, createVideoCardHTML(window.currentContextVideos[2], 2));
      }
    }

    // innerHTML을 사용하여 스타일 유지 (타이핑 시 HTML 태그 깨짐 방지 위해 최소한의 파싱만 진행)
    contentEl.innerHTML = parsedText;

    // 최하단 자동 스무스 스크롤 추적
    const scrollArea = document.querySelector(".card-display-area");
    if (scrollArea) {
      scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
    }
  }

  // 2. 루프 종료 검사 (그록 서버가 전송을 마쳤고 + 인쇄 큐가 완전히 바닥났을 때)
  if (grokTextFinished && typingQueue.length === 0) {
    if (currentGrokBubble) {
      // 타이핑이 끝난 말풍선 최하단에 카카오톡 전송 버튼 부착 (비디오가 있을 때만)


      currentGrokBubble.classList.remove("typing-cursor"); // 커서 제거
      currentGrokBubble = null;
    }
    isTypingLoopRunning = false;
    grokTextFinished = false;
    console.log("🎬 [Typewriter Done] 모든 텍스트 타이핑 모션이 성공적으로 완수되었습니다.");
    return;
  }

  // 3. 타이핑 템포 다이내믹 트래킹 (밀린 글자가 많으면 초고속 10ms, 적으면 일반 35ms로 동적 변조)
  const delay = typingQueue.length > 12 ? 10 : 35;
  setTimeout(runTypewriterLoop, delay);
}

// 🎙️ 브라우저 WebSpeech API를 활용한 최초 온보딩용 고정밀 음성 검색 인식기 (실시간 타이핑 전사 적용)
function startOnboardingSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("SpeechRecognition not supported in this browser.");
    return;
  }
  
  // 사용자가 무엇을 말해야 하는지 예시 가이드를 화면 상단에 깔끔하게 노출
  showToast("🎙️ 마이크 켜짐! '손흥민 골 보여줘' 라고 말씀해 보세요.");
  
  if (recognition) {
    try { recognition.abort(); } catch(e) {}
  }
  
  recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.interimResults = true; // 실시간 받아쓰기 활성화
  recognition.continuous = false;    // 한 문장이 끝나면 감지 멈춤
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interimTranscript = "";
    let finalTranscript = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    const currentText = finalTranscript || interimTranscript;
    console.log("🎙️ [WebSpeech STT 실시간 전사]", { final: finalTranscript, interim: interimTranscript });

    if (currentText && currentText.trim().length > 0 && !hasRenderedYoutubeWidget) {
      // 1. 유저 화면 전사용 싱글 말풍선 렌더링
      if (!currentUserBubble) {
        currentUserBubble = createChatBubble("user");
      }
      
      const contentEl = currentUserBubble.querySelector(".bubble-content");
      
      if (finalTranscript) {
        // 말이 완전히 확정되었을 때
        contentEl.innerText = finalTranscript;
        contentEl.style.opacity = "1.0"; // 확실하게 강조
      } else {
        // 사용자가 말하고 있는 도중 (실시간 타이핑 효과)
        contentEl.innerText = interimTranscript;
        contentEl.style.opacity = "0.6"; // 반투명 연출
      }
      
      // 화면 자동 스크롤
      const scrollArea = document.querySelector(".card-display-area");
      if (scrollArea) scrollArea.scrollTo({ top: scrollArea.scrollHeight, behavior: 'smooth' });
    }

    // 최종 확정 텍스트가 나왔을 경우 그록에게 전송하여 도구 호출 트리거
    if (finalTranscript && finalTranscript.trim().length > 0 && !hasRenderedYoutubeWidget) {
      // 2. Realtime WebSocket 채널로 그록에게 텍스트 명령 주입
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "text", text: finalTranscript }]
          }
        }));
        ws.send(JSON.stringify({ type: "response.create" }));
      }
      // 말풍선 바인딩 초기화
      currentUserBubble = null;
    }
  };

  recognition.onerror = (err) => {
    console.error("SpeechRecognition error:", err);
    // 에러 발생 시 말풍선 초기화 및 재기동 대비
    currentUserBubble = null;
  };

  recognition.onend = () => {
    console.log("SpeechRecognition stopped.");
    // 💡 아직 썸네일 카드가 노출되기 전이고, 세션이 살아있다면 자동으로 음성인식을 재시작해 기회를 줍니다.
    if (isRecording && !hasRenderedYoutubeWidget && ws && ws.readyState === WebSocket.OPEN) {
      console.log("🔄 온보딩 검색 대기 유지: WebSpeech Recognition 재기동");
      try {
        recognition.start();
      } catch (e) {
        // 이미 켜진 경우의 에러 방어
      }
    }
  };

  recognition.start();
  console.log("🎙️ WebSpeech Recognition 기동 완료 (실시간 타이핑 모드)");
}

// 🍞 화면 중앙 상단 검색 인텐트 피드백용 프리미엄 글래스모피즘 토스트
function showToast(message) {
  const oldToast = document.getElementById("search-toast");
  if (oldToast) oldToast.remove();

  if (!document.getElementById("toast-styles")) {
    const style = document.createElement("style");
    style.id = "toast-styles";
    style.innerHTML = `
      @keyframes toastFadeIn {
        from { opacity: 0; transform: translate(-50%, -10px); }
        to { opacity: 1; transform: translate(-50%, 0); }
      }
      @keyframes toastFadeOut {
        from { opacity: 1; transform: translate(-50%, 0); }
        to { opacity: 0; transform: translate(-50%, 10px); }
      }
    `;
    document.head.appendChild(style);
  }

  const toast = document.createElement("div");
  toast.id = "search-toast";
  toast.style.cssText = `
    position: absolute;
    top: 25px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(18, 18, 24, 0.85);
    border: 1px solid rgba(0, 240, 255, 0.35);
    box-shadow: 0 8px 32px rgba(0, 240, 255, 0.15);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    color: #ffffff;
    padding: 10px 20px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 700;
    font-family: var(--font-sans);
    z-index: 9999;
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 8px;
    animation: toastFadeIn 0.4s var(--apple-easing) forwards;
  `;
  // 첫 글자가 이모지 계열일 경우 중복 처리를 방지하기 위해 이모지가 포함되지 않았을 때만 기본 🔍 표시
  const showDefaultIcon = !message.startsWith("🎙️") && !message.startsWith("🔍") && !message.startsWith("🎬") && !message.startsWith("⚠️") && !message.startsWith("❌");
  
  toast.innerHTML = `
    ${showDefaultIcon ? '<span style="color:#00f0ff; animation: pulse 1.5s infinite;">🔍</span>' : ''}
    <span>${message}</span>
  `;
  
  const deviceFrame = document.querySelector(".device-frame");
  if (deviceFrame) {
    deviceFrame.appendChild(toast);
  } else {
    document.body.appendChild(toast);
  }

  setTimeout(() => {
    toast.style.animation = "toastFadeOut 0.4s var(--apple-easing) forwards";
    setTimeout(() => toast.remove(), 400);
  }, 4500); // 4.5초 동안 노출하여 대화 예시 가이드를 편안하게 읽을 수 있게 함
}

// 🎬 유튜브 로고 로띠 애니메이션 로더
function initLottieLogo() {
  const container = document.getElementById("lottie-logo");
  if (!container || typeof lottie === "undefined") {
    console.warn("Lottie library or container not found.");
    return;
  }
  
  lottie.loadAnimation({
    container: container,
    renderer: "svg",
    loop: true,
    autoplay: true,
    path: "/lottie/Youtube Logo Effect.json"
  });
  console.log("🎬 Lottie Animation loaded: Youtube Logo Effect");
}
