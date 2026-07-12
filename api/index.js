import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fetch from "node-fetch";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 윈도우 숨김 파일 제약을 피하기 위한 env.txt 자동 동기화 로직
const txtPath = path.join(__dirname, "../env.txt");
const dotPath = path.join(__dirname, "../.env");
if (fs.existsSync(txtPath)) {
  fs.copyFileSync(txtPath, dotPath);
}

dotenv.config({ override: true });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// 1. xAI Grok Realtime Ephemeral Token 발급 Endpoint (가성비 Grok 단독 모드)
app.post("/api/session", async (req, res) => {
  const apiKey = process.env.XAI_API_KEY ? process.env.XAI_API_KEY.trim() : null;
  if (!apiKey) {
    console.warn("⚠️ [WARN] XAI_API_KEY가 설정되지 않았습니다. 프론트엔드가 Mock 모드로 동작합니다.");
    return res.json({ 
      value: "mock-key-unlocked-youtube-archive-12345",
      isMock: true
    });
  }

  try {
    console.log("📡 [Session Engine] xAI Grok Voice 임시 토큰 발급 기동...");
    const response = await fetch("https://api.x.ai/v1/realtime/client_secrets", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-voice-latest",
        expires_after: { seconds: 300 }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ xAI Ephemeral Token 발급 에러:", errorText);
      return res.status(500).json({ error: errorText });
    }

    const data = await response.json();
    if (!data.value) {
      console.error("❌ xAI 응답 내 Ephemeral Token(value) 부재:", data);
      return res.status(500).json({ error: data.error?.message || "xAI에서 세션 임시 키를 받아오지 못했습니다." });
    }
    return res.json(data);
  } catch (err) {
    console.error("❌ xAI 세션 생성 에러:", err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. 카카오 PlayMCP 게이트웨이 Mock & Relay API
app.post("/api/mcp-gateway", async (req, res) => {
  const { name, arguments: args } = req.body;
  console.log(`📡 [MCP Call] 툴 호출: ${name}, 매개변수:`, args);

  if (name === "show_youtube_widget") {
    console.log(`🎬 [show_youtube_widget] 위젯 생성 요청 접수. 검색어: '${args.searchQuery}'`);
    return res.json({ success: true, videos: args.videos });
  }

  if (name === "telegram_send") {
    console.log(`✈️ [telegram_send] 텔레그램 전송 요청 접수:`, args);
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    
    if (!botToken || !chatId) {
      console.warn("⚠️ [WARN] TELEGRAM_BOT_TOKEN 또는 TELEGRAM_CHAT_ID가 .env에 존재하지 않습니다. Mock 성공으로 폴백 처리합니다.");
      return res.json({ 
        success: true, 
        message: "텔레그램 전송 성공 (Mock)", 
        details: args 
      });
    }

    try {
      // 제목에 <, > 등이 들어가 HTML 태그로 오해받지 않도록 이스케이프 처리
      const safeTitle = args.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const text = `🎯 <b>유튜브 아카이브</b>\n\n📌 <b>제목:</b> ${safeTitle}\n🔗 <b>링크:</b> ${args.videoUrl}`;
      const teleUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
      const response = await fetch(teleUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: "HTML"
        })
      });

      if (response.ok) {
        console.log("✅ 텔레그램 메시지 발송 완료!");
        return res.json({ success: true, message: "텔레그램 메시지 전송 성공" });
      } else {
        const errorText = await response.text();
        console.error("❌ 텔레그램 API 에러 응답:", errorText);
        return res.json({ success: false, error: errorText });
      }
    } catch (err) {
      console.error("❌ 텔레그램 전송 예외 발생:", err);
      return res.json({ success: false, error: err.message });
    }
  }

  if (name === "youtube_search_videos") {
    const originalQuery = args.query || "";
    console.log(`🎬 [youtube_search_videos] '${originalQuery}' 실시간 롱폼 최신 비디오 검색 시작`);
    
    // 쉼표 분리 및 쿼리 정제 (유튜브 최신순 정렬 깨짐 방지용)
    let cleanQuery = originalQuery;
    if (cleanQuery.includes(",")) {
      cleanQuery = cleanQuery.split(",")[0].trim();
    }
    if (cleanQuery.length > 30) {
      cleanQuery = cleanQuery.substring(0, 30);
    }
    const query = cleanQuery;
    console.log(`🔍 [Query Sanitized] '${originalQuery}' ➡️ '${query}' (최신순 필터 전송)`);
    
    const ytApiKey = process.env.YOUTUBE_API_KEY;
    
    // ── 1단계: 공식 YouTube Data API v3 실시간 검색 ──
    if (ytApiKey) {
      try {
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=5&order=date&relevanceLanguage=ko&key=${ytApiKey}`;
        const ytRes = await fetch(searchUrl);
        
        if (ytRes.ok) {
          const ytData = await ytRes.json();
          const videoIds = (ytData.items || []).map(item => item.id.videoId).join(",");
          
          if (videoIds) {
            const detailUrl = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,statistics,snippet&id=${videoIds}&key=${ytApiKey}`;
            const detailRes = await fetch(detailUrl);
            if (detailRes.ok) {
              const detailData = await detailRes.json();
              const videos = (detailData.items || []).map(item => {
                const duration = parseISO8601Duration(item.contentDetails.duration);
                const viewCountVal = parseInt(item.statistics.viewCount || "0", 10);
                const viewCount = formatViewCount(viewCountVal);
                const publishedTime = formatPublishedAt(item.snippet.publishedAt);

                return {
                  title: item.snippet.title,
                  channelTitle: item.snippet.channelTitle,
                  thumbnailUrl: item.snippet.thumbnails?.high?.url || `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
                  videoUrl: `https://www.youtube.com/watch?v=${item.id}`,
                  duration,
                  publishedTime,
                  viewCount
                };
              })
              .filter(v => {
                const parts = v.duration.split(":");
                if (parts.length === 1) return false;
                if (parts.length === 2 && parseInt(parts[0], 10) === 0) return false;
                return true;
              })
              .slice(0, 3);
              
              if (videos.length === 3) {
                console.log(`✅ [YouTube API] 공식 실시간 롱폼 최신순 검색 성공: ${videos.length}개 결과`);
                return res.json({ success: true, videos, source: "youtube_api" });
              }
            }
          }
        }
      } catch (err) {
        console.warn(`⚠️ [YouTube API] 호출 에러: ${err.message}, 스크래핑 단계로 폴백`);
      }
    }
    
    // ── 2단계: 유튜브 표준 오픈 그래프(Open Graph) & itemprop 메타 태그 기반 정밀 파서 + 한국Lock 최신순 정렬 ──
    try {
      console.log(`📡 [YouTube Scraper] 오픈 그래프/메타 태그 검색 기동 (한국 Lock 최신순 필터): '${originalQuery}'`);
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D&gl=KR&hl=ko`;
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          "Cookie": "PREF=hl=ko&gl=KR;"
        }
      });
      const html = await response.text();
      
      const videoIdMatches = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)];
      const uniqueIds = [...new Set(videoIdMatches.map(m => m[1]))].slice(0, 15);
      
      console.log(`🔍 [Scraper] 감지된 메타 후보 비디오 개수: ${uniqueIds.length}개`);
      
      const metadataPromises = uniqueIds.map(async (videoId) => {
        try {
          const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
          const videoRes = await fetch(videoUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept-Language": "ko-KR,ko;q=0.9"
            }
          });
          if (!videoRes.ok) return null;
          const videoHtml = await videoRes.text();
          
          const titleMatch = videoHtml.match(/<meta property="og:title" content="([^"]+)"/) || videoHtml.match(/<meta name="title" content="([^"]+)"/);
          if (!titleMatch) return null;
          let title = titleMatch[1];
          
          const channelMatch = videoHtml.match(/<link itemprop="name" content="([^"]+)"/) || videoHtml.match(/<meta itemprop="name" content="([^"]+)"/);
          if (!channelMatch) return null;
          let channelTitle = channelMatch[1];
          
          const durationMatch = videoHtml.match(/<meta itemprop="duration" content="([^"]+)"/);
          if (!durationMatch) return null;
          const isoDuration = durationMatch[1];
          const duration = parseISO8601Duration(isoDuration);
          
          const parts = duration.split(":");
          if (parts.length === 2 && parseInt(parts[0], 10) === 0) {
            return null;
          }
          
          const isShortsCanonical = videoHtml.includes(`href="https://www.youtube.com/shorts/`) || videoHtml.includes(`"canonical":"https://www.youtube.com/shorts/`);
          if (isShortsCanonical) {
            return null;
          }
          
          // 3중 조회수 파서 도입 (실시간 조회수 추출 보장)
          let viewCount = "조회수 0회";
          const jsonViewTextMatch = videoHtml.match(/"viewCountText":\s*\{\s*"simpleText"\s*:\s*"([^"]+)"\}/) || videoHtml.match(/"viewCountText":\s*\{\s*"runs"\s*:\s*\[\s*\{\s*"text"\s*:\s*"([^"]+)"\}/);
          const rawViewCountMatch = videoHtml.match(/"viewCount"\s*:\s*"(\d+)"/);
          const metaInteractionMatch = videoHtml.match(/<meta itemprop="interactionCount" content="(\d+)"/);
          
          if (jsonViewTextMatch) {
            viewCount = jsonViewTextMatch[1] || jsonViewTextMatch[2];
          } else if (rawViewCountMatch) {
            const count = parseInt(rawViewCountMatch[1], 10);
            viewCount = formatViewCount(count);
          } else if (metaInteractionMatch) {
            const count = parseInt(metaInteractionMatch[1], 10);
            viewCount = formatViewCount(count);
          }
          
          const dateMatch = videoHtml.match(/<meta itemprop="datePublished" content="([^"]+)"/);
          let publishedTime = "최근";
          if (dateMatch) {
            publishedTime = formatPublishedAt(dateMatch[1]);
          }
          
          const cleanTitle = title
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">");
          
          const cleanChannel = channelTitle
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&amp;/g, "&");
          
          console.log(`✅ [Scraper Debug] ID ${videoId} 메타 파싱 완료: "${cleanTitle.substring(0, 15)}..." [${duration}]`);
          
          return {
            title: cleanTitle,
            channelTitle: cleanChannel,
            thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
            videoUrl,
            duration,
            publishedTime,
            viewCount
          };
        } catch (e) {
          return null;
        }
      });
      
      const results = await Promise.all(metadataPromises);
      const videos = results.filter(v => v !== null).slice(0, 3);
      
      if (videos.length === 3) {
        console.log(`✅ [YouTube Scraper] 최신순 실시간 롱폼 오픈 그래프 검색 성공: ${videos.length}개 결과 리턴`);
        return res.json({ success: true, videos, source: "youtube_scraper" });
      } else {
        console.warn(`⚠️ [YouTube Scraper] 3개 롱폼 영상 확보 실패 (수집 개수: ${videos.length}개)`);
      }
    } catch (err) {
      console.warn("⚠️ [YouTube Scraper] 크롤링 에러:", err.message);
    }
    
    console.log(`❌ [유튜브 검색 실패] '${query}' 에 대한 실시간 검색 결과를 찾지 못했습니다.`);
    return res.json({ success: false, error: "실시간 유튜브 검색 결과가 없거나 실패했습니다. 다른 검색어로 재요청해 보세요." });
  }

  res.status(400).json({ error: "알 수 없는 MCP 툴 호출" });
});

function parseISO8601Duration(durationStr) {
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "0:00";
  
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);
  
  const formattedSec = seconds < 10 ? `0${seconds}` : seconds;
  
  if (hours > 0) {
    const formattedMin = minutes < 10 ? `0${minutes}` : minutes;
    return `${hours}:${formattedMin}:${formattedSec}`;
  }
  return `${minutes}:${formattedSec}`;
}

function formatViewCount(num) {
  if (isNaN(num) || num === null) return "조회수 0회";
  return `조회수 ${num.toLocaleString()}회`;
}

function formatPublishedAt(dateStr) {
  const published = new Date(dateStr);
  const now = new Date();
  const diffMs = now - published;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));
  const diffYears = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 365));

  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 30) return `${diffDays}일 전`;
  if (diffMonths < 12) return `${diffMonths}개월 전`;
  return `${diffYears}년 전`;
}

// 🎙️ 서버 시작 시 config.json의 웰컴 메시지를 로컬 MP3 파일로 구워두기 (xAI API 요금 소모 최소화)
async function generateWelcomeMp3() {
  const welcomeMp3Path = path.join(__dirname, "../public", "welcome.mp3");
  const configPath = path.join(__dirname, "../public", "config.json");
  const welcomeTextCachePath = path.join(__dirname, "../public", "welcome_text.txt");
  const apiKey = process.env.XAI_API_KEY ? process.env.XAI_API_KEY.trim() : null;

  if (!apiKey) {
    console.warn("⚠️ [TTS Generator] XAI_API_KEY가 없어 welcome.mp3를 생성하지 못했습니다.");
    return;
  }

  // 1. config.json에서 웰컴 메시지 읽기
  let welcomeText = "반갑습니다! 어떤 영상이 궁금하신가요?";
  try {
    if (fs.existsSync(configPath)) {
      const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (configData.welcome_message) {
        welcomeText = configData.welcome_message;
      }
    }
  } catch (err) {
    console.error("⚠️ config.json 로드 실패:", err.message);
  }

  let lastText = "";
  if (fs.existsSync(welcomeTextCachePath)) {
    lastText = fs.readFileSync(welcomeTextCachePath, "utf-8").trim();
  }

  // 텍스트가 달라졌거나 파일이 없으면 기존 mp3 삭제 후 텍스트 캐시 갱신
  if (lastText !== welcomeText || !fs.existsSync(welcomeMp3Path) || fs.statSync(welcomeMp3Path).size === 0) {
    console.log("🔄 [TTS Generator] 웰컴 메시지 변경 감지 또는 파일 없음! welcome.mp3 재생성합니다.");
    if (fs.existsSync(welcomeMp3Path)) {
      try { fs.unlinkSync(welcomeMp3Path); } catch (e) {}
    }
    fs.writeFileSync(welcomeTextCachePath, welcomeText);
    
    console.log(`🎙️ [TTS Generator] 웰컴 메시지 welcome.mp3 빌드 시작... "${welcomeText}"`);
    try {
      const ttsUrl = "https://api.x.ai/v1/tts";
      const res = await fetch(ttsUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          text: welcomeText,
          voice_id: "lumen", 
          language: "ko",
          output_format: {
            codec: "mp3",
            sample_rate: 24000
          },
          speed: 1.3 
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`TTS API 에러 응답: ${res.status} - ${errText}`);
      }

      const buffer = await res.buffer();
      fs.writeFileSync(welcomeMp3Path, buffer);
      console.log("🎉 [TTS Generator] welcome.mp3 생성 성공! (xAI Lumen 1.3배속 적용)");
    } catch (err) {
      console.error("❌ [TTS Generator] 웰컴 메시지 생성 실패:", err.message);
    }
  } else {
    console.log("✅ [TTS Generator] welcome.mp3 파일이 최신 상태입니다. 생성을 생략합니다.");
  }
}

app.listen(PORT, async () => {
  console.log(`🚀 MVP 서버 실행 중: http://localhost:${PORT}`);
  await generateWelcomeMp3();
});

export default app;
