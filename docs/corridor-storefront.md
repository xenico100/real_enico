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


## Follow-up: panel navigation and payment layout

The route loading component no longer renders the retired header, hero or product/collection grids. Lazy panels have an immediately visible, cancellable Suspense fallback, and the mobile menu remains present until the parent acknowledges a mounted panel. Info and cart backdrops are visible from their first frame. The scene remains mounted outside the panel boundary.

Closing a query-opened panel uses Next-compatible native history replacement instead of a route request. Cart login, account checkout and account order/contact actions use callbacks to switch panels in place; standalone order-page links retain their routing behavior. Bank-transfer and card-payment controls share the same 52px height, full width, padding and typography without changing payment handlers.

Verification on 2026-11-06:

- Final production build and changed-file ESLint passed; storefront 37/37 and payment 96/96 tests passed.
- Mobile WebKit exercised a 900ms cold-chunk delay, all main menu panels, login/signup/recovery/guest-order tabs, cart-to-login, and query-opened login dismissal. The scene node remained mounted, with zero unintended document/RSC navigations and zero runtime errors.
- Isolated member sessions in mobile WebKit (402x780) and desktop Chromium (1440x900) passed 12 geometry/navigation checks. Bank and card controls measured 298x52px on mobile and 457x52px on desktop, with matching 16px horizontal padding, 14.72px text and 8px radius; horizontal overflow was zero.
- Member summary/account/orders/cart tabs, account-to-checkout and the previous-order contact link kept the current showroom and cart intact. Authentication/profile/order reads used fixtures; HTTP writes were intercepted, and no payment or order was submitted.
