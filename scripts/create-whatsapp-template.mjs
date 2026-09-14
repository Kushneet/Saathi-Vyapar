/**
 * scripts/create-whatsapp-template.mjs
 *
 * One-time setup script: creates the "saathi_vyapar_welcome" utility template
 * on the WhatsApp Business Account, replacing Meta's generic sample template
 * ("jaspers_market_order_confirmation_v1") with real, site-specific content.
 *
 * Templates must be approved by Meta before they can be sent (status starts
 * "PENDING"). Re-running this script for a template name that's already
 * pending/approved will fail — that's expected; either wait for approval or
 * change WHATSAPP_WELCOME_TEMPLATE_NAME to create a new one.
 *
 * Usage:
 *   node --env-file=.env.local scripts/create-whatsapp-template.mjs
 */

const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const apiVersion = process.env.WHATSAPP_API_VERSION || 'v22.0';
const templateName = process.env.WHATSAPP_WELCOME_TEMPLATE_NAME || 'saathi_vyapar_welcome';
const templateLang = process.env.WHATSAPP_WELCOME_TEMPLATE_LANG || 'hi';

if (!accessToken || !wabaId) {
  console.error(
    'Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID.\n' +
      'Run with: node --env-file=.env.local scripts/create-whatsapp-template.mjs'
  );
  process.exit(1);
}

const payload = {
  name: templateName,
  language: templateLang,
  category: 'utility',
  parameter_format: 'named',
  components: [
    {
      type: 'body',
      text: 'नमस्ते {{name}}! 🙏\n\nआपका *साथी व्यापार* खाता बन गया है। मैं आपका व्यापारिक सहायक हूँ। अपना निःशुल्क वित्तीय प्लान पाने के लिए इस नंबर पर कोई भी संदेश भेजें।',
      example: {
        body_text_named_params: [{ param_name: 'name', example: 'रमेश कुमार' }],
      },
    },
    {
      type: 'footer',
      text: 'Saathi Vyapar',
    },
  ],
};

const response = await fetch(
  `https://graph.facebook.com/${apiVersion}/${wabaId}/message_templates`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  }
);

const data = await response.json();

if (!response.ok) {
  console.error(`Template creation failed (${response.status}):`, JSON.stringify(data, null, 2));
  process.exit(1);
}

console.log('Template created:', JSON.stringify(data, null, 2));
console.log(
  `\nSet these in .env.local once approved:\nWHATSAPP_WELCOME_TEMPLATE_NAME=${templateName}\nWHATSAPP_WELCOME_TEMPLATE_LANG=${templateLang}`
);
