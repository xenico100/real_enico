# Connected corridor storefront

The approved ceiling-wire corridor is the storefront home. The geometry, twenty original garment cutouts and three collection-frame assets are preserved. The scene is a same-origin iframe; actual React storefront components own product details, the cart, payment flows, authentication, order lookup, contact and community.

## Catalog and inventory

SSR and `GET /api/storefront/catalog` share `buildPublicStorefrontCatalog`. The endpoint is uncached and distinguishes an unavailable upstream (503) from a valid empty catalog (200). Queries retain publication controls and the existing explicit archived flower-jacket exception. Internal raw order provenance, test products and nonpositive-price historical rows are excluded.

The client refreshes on mount, focus, visibility restoration, reconnection and every 60 seconds while visible. Add-to-cart and direct checkout request fresh data and stop if it cannot be verified. An already-open cart reconciles sold-out/removed products and changed prices. The existing server order validator remains authoritative for stock, canonical price, duplicate product IDs and one-item quantities.

Read-only verification on 2026-11-06 returned 21 products (17 available, four sold out) and three collections. Sold-out items were Re: flower of evil jacket (220,000 KRW), Night Dee, Check Kitty and Where GA-O-RI (28,000 KRW each). Prices and details remain visible; purchase controls are disabled. The original twenty scene assets are keyed by product ID, so catalog sorting cannot attach a garment image to the wrong product. Additional published products use their actual product image.

## Interaction and detail pages

Quick details preserve native corridor scrolling; background tap or vertical scrolling returns to browsing. Full detail pages use one vertical scroller, contained product photos, complete descriptions and original long detail images at their natural ratio. Mobile detail pages expose a safe-area-aware 44px backdrop and use 44px close controls. Outside vertical wheel/swipe, backdrop tap and Escape dismiss details; scrolling inside the dialog continues reading. Collection galleries use real collection IDs and images.

The iframe sends only validated commands and IDs. The parent checks both origin and exact frame source and resolves product values from the current catalog. Prototype carts, forms and simulated success messages have been removed. Authentication labels and cart counts come from the existing contexts. Real product Smartstore URLs are used when present; the store-home fallback is labeled as a store visit.

The independent loading guard displays retry controls on failure or a delayed connection. Google fonts do not block scene initialization. Three.js r186 is vendored only for the isolated approved renderer, with its MIT license in `public/corridor/vendor/LICENSE-three.txt`; the existing application's Three.js dependency is unchanged.

## Verification

- `npm run build`: production compilation, TypeScript and page generation passed.
- ESLint over changed application, API, scene and regression-test files: passed.
- `npm run test:storefront`: 37/37 passed (bridge validation, asset-ID mapping, publication, sold-out prices, API failure/empty behavior, media safety, purchase-feed compatibility and real popup rendering).
- Existing suites: payments 96/96, orders 102/102, security 36/36, analytics 58/58, signup notifications 26/26 and SMS retirement 4/4. These 322 passing executions include scripts reused between suites.
- Desktop Chromium against the production build: 20 functional checks passed, including all four sold-out products, all three collection arrivals, shared cart, real menus, stock changes, authoritative empty catalogs and controlled 503 handling. After fixing a transient null layout during parent-overlay resizes, six focused transition/layout checks passed with zero runtime errors.
- Controlled image failures in production Chromium: optimizer 500 retried the identical original successfully, changing gallery source reset recovery correctly, and original-source failure displayed an explicit message without an infinite retry loop; zero runtime errors.
- Mobile WebKit at 402x780 against the production build: real 21-product/3-collection scene, empty initial cart, 44px modal controls/backdrop, contained gallery, original full description, 1080x21153 long image rendered at 402x7874, backdrop exit, sold-out controls and product deep links passed without page errors.

Browser checks intercept non-read requests so validation does not create orders, charge a payment, send contact/chat messages or pollute analytics. Real payment-provider authorization and physical iPhone hardware were not exercised.
