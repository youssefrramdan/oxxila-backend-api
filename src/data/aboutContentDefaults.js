// src/data/aboutContentDefaults.js
/**
 * Canonical About copy (matches storefront i18n / static docs).
 * Used by seed script and admin form defaults.
 */
export const ABOUT_CONTENT_DEFAULTS = {
  slug: 'about',
  title: 'About Oxxila',
  subtitle: 'Science-driven pharmaceutical skincare in Egypt.',
  isPublished: true,
  sections: [
    {
      key: 'intro',
      title: 'About Oxxila',
      subtitle: 'A New Inception',
      body: [
        'Oxxila Pharma is an Egyptian pharmaceutical skincare company built on rigorous science, regulatory compliance, and clinical integrity. We manufacture and distribute dermatologist-trusted solutions for consumers who expect medical-grade standards.',
        'From proprietary formulations to curated international imports, every product in our portfolio is selected and validated against pharmaceutical quality benchmarks — so your skincare routine is informed, safe, and effective.',
      ].join('\n\n'),
      items: [
        {
          title: 'Proprietary Formulations',
          description:
            'In-house R&D and manufacturing aligned with EDA requirements and GMP protocols.',
        },
        {
          title: 'Curated Imports',
          description:
            'Premium global brands vetted for authenticity, stability, and clinical relevance.',
        },
      ],
      buttonLabel: '',
    },
    {
      key: 'quality',
      title: 'Quality & Compliance',
      subtitle:
        'Every product in our portfolio meets pharmaceutical-grade standards enforced through regulatory oversight and certified manufacturing.',
      body: '',
      items: [
        {
          title: 'EDA-Registered',
          description:
            'All marketed products are registered with the Egyptian Drug Authority for safety and traceability.',
        },
        {
          title: 'GMP Standards',
          description:
            'Manufacturing partners operate under Good Manufacturing Practice for consistent product quality.',
        },
        {
          title: 'ISO-Certified',
          description:
            'Quality management systems certified to international ISO standards across our supply chain.',
        },
      ],
      buttonLabel: '',
    },
    {
      key: 'medical',
      title: 'Medically Aligned Solutions',
      subtitle:
        'We collaborate with dermatology experts and clinical advisors to ensure every recommendation reflects evidence-based skincare science.',
      body: '',
      items: [
        {
          title: 'R&D Focused',
          description:
            'Continuous research into active ingredients, stability, and skin compatibility.',
        },
        {
          title: 'Medical Grade Protocols',
          description:
            'Formulation and handling processes aligned with pharmaceutical best practices.',
        },
        {
          title: 'Regulated Content',
          description:
            'Product information reviewed for clinical accuracy and regulatory compliance.',
        },
      ],
      buttonLabel: '',
    },
    {
      key: 'infrastructure',
      title: 'Infrastructure & Supply Chain',
      subtitle: '',
      body: '',
      items: [
        {
          title: 'Licensed Infrastructure',
          description: 'EDA-licensed facilities for storage, handling, and distribution.',
        },
        {
          title: 'Certified Warehouse',
          description: 'Climate-controlled warehousing with batch traceability.',
        },
        {
          title: 'Monitored Supply Chain',
          description: 'End-to-end logistics monitoring from manufacturer to your door.',
        },
      ],
      buttonLabel: '',
    },
    {
      key: 'authenticity',
      title: 'Authenticity Seal',
      subtitle: '',
      body: 'Our entire portfolio is EDA-registered. Every product you receive is verified for authenticity, safety, and regulatory compliance.',
      items: [],
      buttonLabel: 'View Certificate',
    },
  ],
};
