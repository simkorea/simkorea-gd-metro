module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { name, phone, unit_type, message, channel } = req.body || {};
  if (!name || !phone) return res.status(400).json({ error: '이름과 연락처는 필수입니다.' });

  /* 광고 유입 구분. 허용 값만 받는다(임의 문자열이 source 로 들어가지 않게). */
  const fromToss = channel === 'toss';
  const SOURCE = fromToss ? '토스-GD메트로타워' : 'GD메트로타워';

  /* ── 1. Supabase 저장 ── */
  const SUPABASE_URL = 'https://tctilpuhknxucrlnhlky.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjdGlscHVoa254dWNybG5obGt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMzE3NjQsImV4cCI6MjA5MTcwNzc2NH0._mS10zf3ayR7nbdFxQJHfZS57_tzOakGm-WkyQB8bxU';

  const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/consultations`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      name,
      phone,
      unit_type: unit_type || null,
      message: message || null,
      source: SOURCE
    })
  });

  if (!sbRes.ok) {
    const err = await sbRes.text();
    console.error('Supabase error:', err);
    return res.status(500).json({ error: err });
  }

  /* ── 2. Resend 이메일 알림 ── */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* 메일이 조용히 실패하면 리드를 놓친다. 응답 상태를 로그에 남긴다 —
     Vercel Logs 에서 /api/consult 호출을 열면 바로 보인다. */
  try {
    if (!process.env.RESEND_API_KEY) {
      console.error('Resend: RESEND_API_KEY 환경변수가 없습니다 (저장은 완료)');
      return res.status(200).json({ success: true, mail: 'no-key' });
    }
    const mailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: ['xinkorea@naver.com'],
        subject: `[GD 메트로타워${fromToss ? ' · 토스 광고' : ''}] 새 방문예약 — ${name}`,
        html: `
          <div style="font-family:'Apple SD Gothic Neo',sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#1C1F24;border-bottom:2px solid #680001;padding-bottom:10px;margin-bottom:16px;">
              GD 메트로타워 · 새 방문예약이 접수되었습니다
            </h2>
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 14px;background:#F1EDE7;font-weight:700;width:30%;border:1px solid #E2DACE;color:#1C1F24;">현장</td>
                <td style="padding:10px 14px;border:1px solid #E2DACE;"><strong style="color:#680001;">GD 메트로타워</strong></td>
              </tr>
              <tr>
                <td style="padding:10px 14px;background:#F1EDE7;font-weight:700;border:1px solid #E2DACE;color:#1C1F24;">이름</td>
                <td style="padding:10px 14px;border:1px solid #E2DACE;">${esc(name)}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;background:#F1EDE7;font-weight:700;border:1px solid #E2DACE;color:#1C1F24;">연락처</td>
                <td style="padding:10px 14px;border:1px solid #E2DACE;">
                  <a href="tel:${esc(phone)}" style="color:#680001;font-weight:700;">${esc(phone)}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 14px;background:#F1EDE7;font-weight:700;border:1px solid #E2DACE;color:#1C1F24;">관심 타입</td>
                <td style="padding:10px 14px;border:1px solid #E2DACE;">${esc(unit_type) || '미선택'}</td>
              </tr>
              <tr>
                <td style="padding:10px 14px;background:#F1EDE7;font-weight:700;border:1px solid #E2DACE;color:#1C1F24;">문의 내용</td>
                <td style="padding:10px 14px;border:1px solid #E2DACE;white-space:pre-wrap;">${esc(message) || '없음'}</td>
              </tr>
            </table>
            <p style="margin-top:20px;color:#8F715F;font-size:12px;">
              GD 메트로타워 분양 안내 ·
              <a href="https://gd-metro.vercel.app" style="color:#680001;">홈페이지 바로가기</a>
            </p>
          </div>
        `
      })
    });
    if (!mailRes.ok) {
      console.error('Resend 발송 실패:', mailRes.status, await mailRes.text());
    }
  } catch (e) {
    console.error('Resend 호출 예외:', e && e.message);
  }

  return res.status(200).json({ success: true });
};
