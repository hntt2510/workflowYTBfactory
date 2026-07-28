import type { ChannelProfile } from "./types";

export const seedChannelProfiles: ChannelProfile[] = [
  {
    id: "insurance-made-simple",
    name: "Insurance Made Simple",
    mainKeyword: "Life insurance",
    secondaryKeywords: [
      "Term life insurance",
      "Whole life insurance",
      "Life insurance explained",
      "Life insurance for beginners",
      "Insurance policy",
      "Life insurance mistakes",
      "Life insurance quotes",
      "Affordable life insurance",
      "Family protection",
      "Coverage basics"
    ],
    niche: "Life insurance education for beginners.",
    contentType:
      "Long-form insurance explainer videos based on keyword research, competitor research, and search intent. Target video length: 6-10 minutes. Evergreen, educational, search-based content.",
    targetAudience:
      "US/UK viewers trying to understand life insurance before buying or comparing policies. Beginners, families, young parents, homeowners, people comparing term and whole life, people searching for affordable life insurance, and people confused about policy, quote, coverage, and beneficiary terms.",
    language: "English",
    tone:
      "Clear, calm, trustworthy, simple, educational, practical, neutral, not salesy, not fear-based, not personal financial advice.",
    visualStyle:
      "Clean 2D explainer animation. Simple professional visuals using family icons, shield icons, policy documents, checklists, simple charts, house icons, calendar icons, soft money icons, blue/green/white/gray palette. Avoid luxury lifestyle visuals, exaggerated money visuals, scam-like thumbnails, too much red warning color, complex financial charts, fear-based imagery.",
    imageStyleModel: {
      name: "Model 1 - Clean 2D Explainer Infographic Animation",
      description:
        "Simple flat 2D vector illustrations, clean lines, minimal shading, soft professional colors, clear educational composition, modern infographic style, beginner-friendly financial explainer visuals."
    },
    voiceStyle:
      "Calm professional male explainer narrator. Clear, calm, professional, trustworthy, neutral, easy to listen to, not dramatic, not salesy.",
    ttsEmotionStyle: ["calm", "clear", "formal", "warm", "emphasis", "serious", "pause 0.5s", "pause 1s"],
    ttsUsage: [
      "Use calm for main explanation.",
      "Use clear for definitions.",
      "Use formal for important policy information.",
      "Use warm for family/protection sections.",
      "Use emphasis for common mistakes.",
      "Use serious for claim denial or policy mistakes.",
      "Use pause 0.5s between short ideas.",
      "Use pause 1s before important transitions."
    ],
    coreHashtags: ["#LifeInsurance", "#InsuranceExplained", "#InsuranceMadeSimple"],
    secondaryHashtags: [
      "#TermLifeInsurance",
      "#WholeLifeInsurance",
      "#FinancialEducation",
      "#InsuranceTips",
      "#FamilyProtection"
    ],
    avoidList: [
      "Do not give personal financial advice.",
      "Do not sound like an insurance agent trying to sell.",
      "Do not use fear-based pressure.",
      "Avoid luxury flex imagery.",
      "Avoid scam-like visuals.",
      "Avoid exaggerated money promises.",
      "Avoid complex charts.",
      "Avoid misleading claims."
    ],
    routerSignals: [
      "life insurance",
      "term life",
      "whole life",
      "policy",
      "premium",
      "beneficiary",
      "coverage",
      "quotes",
      "claim",
      "riders",
      "affordable insurance",
      "family protection",
      "insurance mistakes"
    ],
    safetyRules: [
      "No personal financial advice.",
      "No guaranteed outcomes.",
      "Use educational framing and qualifications."
    ]
  },
  {
    id: "bible-mysteries-revealed",
    name: "Bible Mysteries Revealed",
    mainKeyword: "Bible mysteries",
    secondaryKeywords: [
      "Biblical history",
      "Bible stories",
      "Hidden Bible meanings",
      "Bible prophecy",
      "Strange Bible stories",
      "Old Testament mysteries",
      "New Testament connections",
      "Biblical symbolism",
      "Ancient Bible history",
      "Christian mysteries",
      "Bible explained"
    ],
    niche: "Bible mysteries and biblical history documentaries.",
    contentType:
      "Long-form biblical documentary explanation videos based on competitor research, keyword research, and search intent. Target video length: 8-12 minutes. Structure: mystery question, biblical context, story, symbolic meaning, related scripture/history connection, deeper conclusion.",
    targetAudience:
      "US/UK viewers interested in Bible stories, Christian mysteries, biblical symbolism, prophecy, ancient history, and deeper scripture explanations.",
    language: "English",
    tone:
      "Serious, mysterious, respectful, educational, thoughtful, calm, documentary-style, not overly preachy, not mocking religion, not sensationalized, not claiming uncertain theories as absolute truth.",
    visualStyle:
      "Simple flat 2D Bible animation. Clean vector-like illustration, simplified biblical characters, ancient desert landscapes, old scrolls, temple silhouettes, biblical maps, candles and warm light, ancient city backgrounds, soft clouds, divine light, minimal facial details, limited soft colors, minimal shading, clear storytelling composition. Avoid fantasy visuals, horror angels/demons, gore, overly realistic faces, disrespectful religious framing, shocking thumbnails, childish cartoon exaggeration.",
    imageStyleModel: {
      name: "Model 2 - Simple Flat 2D Bible Animation",
      description:
        "Simple flat 2D biblical animation, clean vector-like illustration, simplified biblical characters, minimal facial details, soft warm colors, ancient Middle Eastern setting, minimal shading, clear documentary storytelling composition, respectful religious visual style."
    },
    voiceStyle:
      "Calm serious male documentary narrator. Deep, calm, serious, slow, respectful, documentary-like, not too dramatic, not ad-like, not too preachy.",
    ttsEmotionStyle: ["serious", "calm", "formal", "whisper", "emphasis", "warm", "pause 0.5s", "pause 1s"],
    ttsUsage: [
      "Use serious for mystery openings and important story moments.",
      "Use calm for explanation.",
      "Use formal for historical/scripture context.",
      "Use whisper for mystery, hidden meaning, prophecy.",
      "Use emphasis for key details.",
      "Use warm for faith, hope, mercy, human meaning.",
      "Use pause 0.5s between ideas.",
      "Use pause 1s before important reveals."
    ],
    coreHashtags: ["#BibleMysteries", "#BibleStories", "#BiblicalHistory"],
    secondaryHashtags: [
      "#BibleExplained",
      "#ChristianMysteries",
      "#BibleProphecy",
      "#OldTestament",
      "#NewTestament"
    ],
    avoidList: [
      "Do not copy competitor wording.",
      "Do not overclaim uncertain interpretations.",
      "Avoid photorealism.",
      "Avoid cinematic realism.",
      "Avoid dramatic movie lighting.",
      "Avoid heavy texture.",
      "Avoid watermark.",
      "Avoid logo.",
      "Avoid readable text.",
      "Avoid anime.",
      "Avoid 3D render if using Model 2."
    ],
    routerSignals: [
      "bible",
      "jesus",
      "moses",
      "david",
      "abraham",
      "old testament",
      "new testament",
      "prophecy",
      "scripture",
      "biblical",
      "christian",
      "gospel",
      "exodus",
      "genesis",
      "temple",
      "ark",
      "messiah",
      "aaron",
      "breastpiece"
    ],
    safetyRules: [
      "Distinguish scripture, historical evidence, tradition, and interpretation.",
      "Do not claim uncertain interpretations as absolute truth.",
      "Use respectful religious framing."
    ]
  },
  {
    id: "viral-case-files",
    name: "Viral Case Files",
    mainKeyword: "Viral lawsuits",
    secondaryKeywords: [
      "Internet scandals",
      "Viral lawsuits explained",
      "YouTuber lawsuits",
      "Creator drama",
      "Business scandals",
      "Influencer controversy",
      "Lawsuit explained",
      "Internet drama",
      "Viral case study",
      "Online controversy",
      "Brand scandal",
      "Copyright drama",
      "AI controversy",
      "Creator economy drama"
    ],
    niche: "Viral Lawsuits & Internet Scandals Explained.",
    contentType:
      "Long-form documentary explanation videos based on trend research, public sources, competitor research, and high-demand viral cases. Target video length: 8-12 minutes. Main format: long-form 8-12 minutes. Secondary format: Shorts cut from long-form videos. Content split: 40% lawsuits, 25% business scandals, 25% creator drama, 10% platform / AI / copyright.",
    targetAudience:
      "US viewers interested in internet drama, lawsuits, creator economy, brand scandals, and viral controversies.",
    language: "English",
    tone:
      "Documentary, neutral, clear, slightly dramatic, source-based, analytical, fast but understandable, not gossip-only, not defamatory, not blindly taking sides, not harassment-driven. Use wording like: according to public reports, court filings claim, the company stated, the creator responded, what remains unclear, based on available information.",
    visualStyle:
      "Stylized 2D mystery documentary illustration. Animated case-file visuals, simplified evidence boards, cartoon-style timeline graphics, blurred social media post mockups, court document illustrations, digital trail maps, red connection lines, character silhouettes, comment icons, notification icons, dark navy/gray/red/white palette. Avoid real screenshots with personal information, doxxing details, photorealistic crime boards, heavy true crime horror vibe, gore, defamatory thumbnails.",
    imageStyleModel: {
      name: "Model 5 - Mystery Explained Illustration",
      description:
        "Stylized 2D mystery documentary illustration, cartoon-like investigative visuals, simplified case files, red string connections, timeline graphics, blurred social media post mockups, court document overlays, dark navy background with red accents, clean composition, minimal realistic detail, slightly dramatic but clearly illustrated, animated explainer aesthetic, not photorealistic."
    },
    voiceStyle:
      "Serious fast-paced male documentary narrator. Clear, serious, slightly tense, neutral, story-driven, not gossip, not comedic, not attacking people.",
    ttsEmotionStyle: [
      "serious",
      "clear",
      "neutral",
      "analytical",
      "suspenseful",
      "emphasis",
      "pause 0.5s",
      "pause 1s"
    ],
    ttsUsage: [
      "Use serious for opening.",
      "Use clear for timeline explanation.",
      "Use neutral for claims, lawsuits, accusations.",
      "Use analytical for causes and impact.",
      "Use suspenseful for turning points.",
      "Use emphasis for important facts.",
      "Use pause 0.5s between timeline beats.",
      "Use pause 1s before conclusions/reveals."
    ],
    coreHashtags: ["#ViralCaseFiles", "#InternetDrama", "#LawsuitExplained"],
    secondaryHashtags: [
      "#ViralScandal",
      "#CreatorDrama",
      "#BusinessScandal",
      "#YouTubeDrama",
      "#OnlineControversy",
      "#CopyrightDrama",
      "#AIControversy"
    ],
    positioning:
      "Not gossip. Not legal advice. Just the case, the timeline, the public evidence, and what still remains unclear.",
    avoidList: [
      "Do not present allegations as proven facts.",
      "Do not defame.",
      "Do not harass.",
      "Do not include doxxing details.",
      "Avoid real personal info.",
      "Avoid real screenshots with private data.",
      "Avoid heavy true-crime gore.",
      "Avoid inflammatory claims."
    ],
    routerSignals: [
      "lawsuit",
      "court filing",
      "complaint",
      "settlement",
      "scandal",
      "controversy",
      "creator drama",
      "influencer",
      "youtuber",
      "brand backlash",
      "copyright",
      "ai lawsuit",
      "allegations",
      "public response",
      "internet drama",
      "platform"
    ],
    safetyRules: [
      "Attribute allegations.",
      "Do not present claims as proven before adjudication.",
      "Avoid defamation and private data."
    ]
  }
];

