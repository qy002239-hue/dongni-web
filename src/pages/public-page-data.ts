import { ROUTES } from '../lib/routes';

export type PageKey = 'about' | 'contact' | 'terms' | 'privacy' | 'pricing' | 'purchase' | 'refund';

export type PageConfig = {
  title: string;
  description: string;
  eyebrow: string;
  intro: string;
  sections: Array<{
    title: string;
    paragraphs: string[];
    bullets?: string[];
  }>;
  ctas: Array<{
    to: string;
    label: string;
    variant?: 'primary' | 'secondary';
  }>;
};

export const PAGE_ORDER: PageKey[] = ['about', 'contact', 'terms', 'privacy', 'pricing', 'purchase', 'refund'];

export const PUBLIC_PAGES: Record<PageKey, PageConfig> = {
  about: {
    title: '關於我們',
    description: '懂妳是一個以情緒陪伴為主的聊天網站，提供 Google 登入、對話 session、免費試用與 Plus 次數方案。',
    eyebrow: 'About',
    intro: '懂妳是陪妳把混亂慢慢說清楚的聊天空間，重點是即時陪伴，不是諮商，也不替妳做人生決定。',
    sections: [
      {
        title: '目前實際提供的功能',
        paragraphs: ['網站目前以聊天與付費次數為核心，沒有額外的社群、課程或醫療功能。'],
        bullets: [
          'Google OAuth 登入後使用聊天。',
          '對話 session 會依 30 分鐘閒置規則自動結束。',
          '新使用者有 3 天免費試用。',
          '可購買 Plus 次數：NT$200 / 1 次、NT$1000 / 6 次。',
          '付款支援 ECPay 與 PayPal，實際可用性由後端即時判斷。'
        ]
      }
    ],
    ctas: [
      { to: ROUTES.chat, label: '回到聊天' },
      { to: ROUTES.pricing, label: '查看收費方案', variant: 'secondary' }
    ]
  },
  contact: {
    title: '聯絡我們',
    description: '目前沒有內建聯絡表單；若遇到登入、付款、帳務或系統問題，請透過既有正式聯絡管道處理。',
    eyebrow: 'Contact',
    intro: '目前網站沒有公開的站內客服表單，也沒有額外的聊天客服模組。',
    sections: [
      {
        title: '遇到這些情況時',
        paragraphs: ['你可以用這個頁面確認網站目前的服務範圍，再把需要處理的交易或登入問題交給維護者。'],
        bullets: [
          'Google 登入失敗或 OAuth 轉址異常。',
          'ECPay / PayPal 付款完成但次數未更新。',
          '看到付款按鈕提示供應商暫時不可用。',
          '想確認交易紀錄、訂單編號或加值狀態。'
        ]
      }
    ],
    ctas: [
      { to: ROUTES.chat, label: '回到聊天' },
      { to: ROUTES.purchase, label: '看購買須知', variant: 'secondary' }
    ]
  },
  terms: {
    title: '使用者條款',
    description: '懂妳的使用條款，涵蓋聊天範圍、付費次數、第三方服務與使用限制。',
    eyebrow: 'Terms',
    intro: '以下條款只針對目前實際提供的功能，不包含尚未上線的產品或假設性的服務。',
    sections: [
      {
        title: '服務範圍',
        paragraphs: ['懂妳提供的是情緒陪伴型聊天服務，不是醫療、心理治療、法律或緊急救援服務。'],
        bullets: [
          '使用服務前需以 Google OAuth 登入。',
          '聊天會依 session 與 30 分鐘閒置規則控制。',
          '若沒有可用次數且試用已結束，系統會引導購買次數。'
        ]
      },
      {
        title: '付款與次數',
        paragraphs: ['Plus 次數由後端控制，前端不能自行改金額或改次數。'],
        bullets: [
          'NT$200 對應 1 次。',
          'NT$1000 對應 6 次。',
          '付款成功後會依 provider callback / webhook 更新狀態。'
        ]
      },
      {
        title: '第三方服務',
        paragraphs: ['網站會使用 Google、Supabase、OpenRouter、ECPay 與 PayPal。各平台的服務中斷、驗證錯誤或限制，會影響實際可用性。']
      }
    ],
    ctas: [
      { to: ROUTES.chat, label: '回到聊天' },
      { to: ROUTES.refund, label: '查看退款政策', variant: 'secondary' }
    ]
  },
  privacy: {
    title: '隱私權政策',
    description: '懂妳會處理 Google OAuth、聊天內容、Supabase 資料與付款平台回傳的必要資訊。',
    eyebrow: 'Privacy',
    intro: '這份隱私權說明只描述目前真正在系統裡會用到的資料，不加入不存在的蒐集項目。',
    sections: [
      {
        title: '會處理的資料',
        paragraphs: ['依現有實作，網站會處理登入、對話與付款所需的最小資料。'],
        bullets: [
          'Google 登入資訊，例如姓名、信箱與 user id。',
          '聊天內容與對話 session 狀態。',
          'Supabase 儲存的帳號、次數與交易資料。',
          'ECPay / PayPal 回傳的訂單與付款狀態。'
        ]
      },
      {
        title: '用途',
        paragraphs: ['這些資料只用於提供聊天、管理 session、計算次數、完成付款與除錯驗證。'],
        bullets: [
          '確認登入身份。',
          '維持對話與次數狀態。',
          '完成付款後更新可用次數。'
        ]
      },
      {
        title: '付款資料',
        paragraphs: ['卡號、付款工具敏感資料由 ECPay 或 PayPal 處理，本站不自行保存信用卡資料。']
      }
    ],
    ctas: [
      { to: ROUTES.chat, label: '回到聊天' },
      { to: ROUTES.about, label: '認識懂妳', variant: 'secondary' }
    ]
  },
  pricing: {
    title: '收費方案',
    description: '懂妳目前提供 3 天免費試用，以及兩種 Plus 次數方案。',
    eyebrow: 'Pricing',
    intro: '所有價格與次數都以後端設定為準，前端只顯示方案內容，不直接決定金額。',
    sections: [
      {
        title: '可用方案',
        paragraphs: ['目前只有這三種實際可用方式：'],
        bullets: [
          '新使用者 3 天免費試用。',
          'NT$200 / 1 次。',
          'NT$1000 / 6 次。'
        ]
      },
      {
        title: '付款方式',
        paragraphs: ['實際付款在聊天頁的購買視窗完成，系統會依供應商可用狀態自動切換 ECPay 或 PayPal。']
      }
    ],
    ctas: [
      { to: ROUTES.chat, label: '回到聊天' },
      { to: ROUTES.purchase, label: '看購買須知', variant: 'secondary' }
    ]
  },
  purchase: {
    title: '購買須知',
    description: '登入後在聊天頁完成購買，系統會自動判斷可用供應商並顯示原因。',
    eyebrow: 'Purchase',
    intro: '這是最短的真實操作路徑，照著做就可以完成正式金流測試。',
    sections: [
      {
        title: '最短步驟',
        paragraphs: ['1. 先登入。2. 回到聊天頁。3. 點「購買次數」。4. 選方案與付款方式。5. 完成付款後回到聊天頁。'],
        bullets: [
          'ECPay / PayPal 的可用狀態由後端即時判斷。',
          '如果供應商設定未完成，按鈕會顯示對應原因，不需要你改程式。',
          '付款成功後，次數會由後端入帳。'
        ]
      }
    ],
    ctas: [
      { to: ROUTES.chat, label: '回到聊天' },
      { to: ROUTES.pricing, label: '查看方案', variant: 'secondary' }
    ]
  },
  refund: {
    title: '退款政策',
    description: '退款目前採人工處理，並依實際交易狀態與金流平台規則判定。',
    eyebrow: 'Refund',
    intro: '目前沒有自助退款頁或退款 API，所有退款都要以交易紀錄與平台規則為準。',
    sections: [
      {
        title: '目前原則',
        paragraphs: ['退款是否可行，會依交易是否完成、次數是否已使用、以及 ECPay / PayPal 的處理規則判定。'],
        bullets: [
          '請先保留訂單編號與付款時間。',
          '若已發放次數，退款會依個案評估。',
          '若交易尚在處理中，請先不要重複付款。'
        ]
      }
    ],
    ctas: [
      { to: ROUTES.chat, label: '回到聊天' },
      { to: ROUTES.contact, label: '聯絡我們', variant: 'secondary' }
    ]
  }
};

export const FOOTER_LINKS = [
  { to: ROUTES.about, label: '關於我們' },
  { to: ROUTES.contact, label: '聯絡我們' },
  { to: ROUTES.terms, label: '使用者條款' },
  { to: ROUTES.privacy, label: '隱私權政策' },
  { to: ROUTES.pricing, label: '收費方案' },
  { to: ROUTES.purchase, label: '購買須知' },
  { to: ROUTES.refund, label: '退款政策' }
];

export function getPublicPageKey(pathname: string): PageKey | null {
  const key = PAGE_ORDER.find((pageKey) => ROUTES[pageKey] === pathname);
  return key || null;
}

export function getPublicPageMeta(pathname: string) {
  const key = getPublicPageKey(pathname);
  if (!key) {
    return {
      title: '懂妳',
      description: '懂妳是一個以情緒陪伴為主的聊天網站。'
    };
  }

  const config = PUBLIC_PAGES[key];
  return {
    title: `${config.title}｜懂妳`,
    description: config.description
  };
}