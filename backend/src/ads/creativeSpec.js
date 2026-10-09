// Spec de creative "clic a WhatsApp". Mismas reglas que agente-gineza:
//  - instagram_user_id (instagram_actor_id está deprecado desde Graph v22)
//  - sin mejoras de IA de Meta: opt-out función por función
//  - con pieza de historia: customización por ubicación (feed 4:5 / historia 9:16), image_label como objeto
export const WHATSAPP_LINK = 'https://api.whatsapp.com/send';

const NO_AI_ENHANCEMENTS = {
  creative_features_spec: Object.fromEntries(
    [
      'image_brightness_and_contrast', 'enhance_cta', 'text_optimizations', 'image_touchups', 'image_uncrop',
      'inline_comment', 'adapt_to_placement', 'media_type_automation', 'description_automation',
      'add_text_overlay', 'image_animation', 'text_generation',
    ].map((f) => [f, { enroll_status: 'OPT_OUT' }]),
  ),
};

export function buildWhatsappCreativeSpec({ name, pageId, igUserId, message, headline, feedImageHash, storyImageHash }) {
  const identity = { page_id: pageId, ...(igUserId ? { instagram_user_id: igUserId } : {}) };
  if (!storyImageHash) {
    return {
      name,
      object_story_spec: {
        ...identity,
        link_data: {
          link: WHATSAPP_LINK,
          message,
          ...(headline ? { name: headline } : {}),
          image_hash: feedImageHash,
          call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } },
        },
      },
      degrees_of_freedom_spec: NO_AI_ENHANCEMENTS,
    };
  }
  return {
    name,
    object_story_spec: identity,
    asset_feed_spec: {
      images: [
        { hash: feedImageHash, adlabels: [{ name: 'feed' }] },
        { hash: storyImageHash, adlabels: [{ name: 'story' }] },
      ],
      bodies: [{ text: message }],
      titles: [{ text: headline || name }],
      link_urls: [{ website_url: WHATSAPP_LINK }],
      ad_formats: ['SINGLE_IMAGE'],
      call_to_action_types: ['WHATSAPP_MESSAGE'],
      optimization_type: 'PLACEMENT',
      asset_customization_rules: [
        {
          customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['feed'], instagram_positions: ['stream'] },
          image_label: { name: 'feed' },
        },
        {
          customization_spec: { publisher_platforms: ['facebook', 'instagram'], facebook_positions: ['story'], instagram_positions: ['story'] },
          image_label: { name: 'story' },
        },
      ],
    },
    degrees_of_freedom_spec: NO_AI_ENHANCEMENTS,
  };
}

const clean = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '');

// Convención de nombres: {CONJUNTO}_{PIEZA}_{YYYYMMDD}
export function buildAdName({ adsetName, creativeName, date }) {
  const tag = clean(adsetName).replace(/\d{8}$/, '').slice(0, 30) || 'CONJUNTO';
  return `${tag}_${clean(creativeName).slice(0, 30)}_${date.replaceAll('-', '')}`;
}
