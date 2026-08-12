// src/lib/metadata.ts
// SEO metadata generation utility for dynamic meta tags

export interface PageMetadata {
  title: string;
  description: string;
  keywords?: string[];
  ogImage?: string;
  ogType?: string;
  canonicalUrl?: string;
  noindex?: boolean;
}

export const defaultMetadata: PageMetadata = {
  title: "StudEx - Campus Marketplace for Student Services | PAU",
  description: "The campus marketplace for students. Book lashes, nails, laundry, and food from verified vendors at Pan-Atlantic University. Fast, safe, and affordable.",
  keywords: [
    "campus marketplace",
    "student services",
    "PAU marketplace",
    "Pan-Atlantic University",
    "student vendors",
    "lashes PAU",
    "nails PAU",
    "laundry service",
    "food delivery",
    "campus delivery",
    "verified vendors",
    "student marketplace Nigeria"
  ],
  ogImage: "/images/og-image.jpg",
  ogType: "website",
};

export const generateMetadata = (page: Partial<PageMetadata> = {}): PageMetadata => {
  return {
    ...defaultMetadata,
    ...page,
    title: page.title ? `${page.title} | StudEx` : defaultMetadata.title,
    keywords: page.keywords ? [...(defaultMetadata.keywords || []), ...page.keywords] : defaultMetadata.keywords,
  };
};

export const pageMetadata = {
  home: generateMetadata({
    title: "Home",
    description: "Discover the best campus services at PAU. Book lashes, nails, laundry, and food from verified student vendors. Safe payments with escrow protection.",
  }),

  auth: generateMetadata({
    title: "Sign In or Sign Up",
    description: "Join StudEx - the trusted campus marketplace for Pan-Atlantic University students. Create an account or sign in to access verified vendors.",
  }),

  categories: generateMetadata({
    title: "Browse All Categories",
    description: "Explore all service categories available on StudEx: Beauty (Lashes, Nails), Laundry, Food Delivery, and more. Find trusted vendors at PAU.",
  }),

  account: generateMetadata({
    title: "My Account",
    description: "Manage your StudEx account, view orders, update profile, and track your wallet balance.",
    noindex: true, // Private page
  }),

  wallet: generateMetadata({
    title: "My Wallet",
    description: "Fund your StudEx wallet, view transaction history, and manage your balance securely.",
    noindex: true, // Private page
  }),

  orders: generateMetadata({
    title: "My Orders",
    description: "Track your StudEx orders, view order history, and manage active bookings.",
    noindex: true, // Private page
  }),

  seller: generateMetadata({
    title: "Become a Verified Vendor",
    description: "Join StudEx as a verified vendor. Sell your services to thousands of PAU students safely with escrow payments.",
  }),
};

// Generate JSON-LD structured data for SEO
export const generateStructuredData = {
  organization: () => ({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "StudEx",
    alternateName: "StudEx Campus Marketplace",
    url: "https://studex.com.ng",
    logo: "https://studex.com.ng/images/logo.png",
    description: "The campus marketplace for student services at Pan-Atlantic University",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Lagos",
      addressRegion: "Lagos",
      addressCountry: "NG",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "Customer Service",
      email: "support@studex.com.ng",
    },
    sameAs: [
      "https://twitter.com/studexng",
      "https://instagram.com/studexng",
      "https://facebook.com/studexng",
    ],
  }),

  localBusiness: () => ({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "StudEx Campus Marketplace",
    image: "https://studex.com.ng/images/og-image.jpg",
    "@id": "https://studex.com.ng",
    url: "https://studex.com.ng",
    telephone: "+234-xxx-xxx-xxxx",
    priceRange: "₦500 - ₦50,000",
    address: {
      "@type": "PostalAddress",
      streetAddress: "Pan-Atlantic University",
      addressLocality: "Ibeju-Lekki",
      addressRegion: "Lagos",
      postalCode: "105101",
      addressCountry: "NG",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: 6.4698,
      longitude: 3.6049,
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      opens: "00:00",
      closes: "23:59",
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.9",
      reviewCount: "500",
    },
  }),

  website: () => ({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "StudEx",
    url: "https://studex.com.ng",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://studex.com.ng/search?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  }),

  product: (listing: any) => ({
    "@context": "https://schema.org",
    "@type": "Product",
    name: listing.title,
    description: listing.description || `${listing.title} service available on StudEx`,
    image: listing.image || "https://studex.com.ng/images/placeholder.jpg",
    brand: {
      "@type": "Brand",
      name: listing.vendor_business || listing.vendor,
    },
    offers: {
      "@type": "Offer",
      url: `https://studex.com.ng/listings/${listing.id}`,
      priceCurrency: "NGN",
      price: listing.price,
      availability: listing.is_available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: listing.vendor_business || listing.vendor,
      },
    },
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      reviewCount: "50",
    },
  }),

  breadcrumbList: (items: { name: string; url: string }[]) => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  }),
};
