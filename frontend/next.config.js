/** @type {import('next').NextConfig} */
// 他サイトへの埋め込み（クリックジャッキング）や不要なブラウザ機能の利用を防ぐヘッダー
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 現在地（地図・現場報告）を使うので geolocation は自サイトのみ許可
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

module.exports = {
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // 職員向け画面は検索エンジンに載せない
      { source: "/ops/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
      { source: "/login", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
    ];
  },
};
