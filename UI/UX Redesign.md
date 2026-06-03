I want to refactor my current application (Image 2 - AISIGNALGRAPH) to adopt the layout, structural hierarchy, and advanced interactive design details of the target website (Image 1 - https://aerukart.com/). 

Please preserve my glowing red color palette, the "AISIGNALGRAPH" logo, the dark background, and the interactive red star/node constellation canvas.

Implement the following code adjustments and styling configurations:

---

### 1. The Interactive Custom Trailing Cursor
Aeruk's site uses a high-end custom cursor tracking script. Please implement this feature in our application:
- Create a custom cursor container (e.g., an element with ID `cur` or a dedicated React component).
- Add JavaScript/TypeScript logic that tracks mouse movements with custom inertia (using requestAnimationFrame with a damping factor of `0.35` for smooth easing).
- Disable this custom cursor on mobile devices (screens under 768px wide).
- When hovering over interactive elements (`a`, `button`, inputs), add a `.hover` class to scale or modify the cursor dot. When hovering over readable text (`h1`, `h2`, `p`, etc.), add a `.text` class to change its appearance.

---

### 2. Centered Pill Navigation (Header)
- **Top Navigation:** Replace the current layout with a centered, pill-shaped `nav` container matching Image 1. 
  - **Styling:** Add a background with dark transparency and glassmorphism styling (`backdrop-filter: blur(12px)`), paired with a very thin, faint red border (e.g., `rgba(255, 0, 60, 0.15)`).
  - **Links:** Maintain the menu items "HOME", "GRAPH", "STORIES", "ENTITIES" inside the centered pill.
- **Top-Right CTA Button:** Reposition the secondary CTA button to the top-right corner. Shape it as a clean pill with a subtle glowing red outline/background that scales smoothly on hover.

---

### 3. Hero Section Typographical Architecture
Structure the central content with layered CSS depths to emulate the hero space of aerukart.com:
- **Upper Sub-Label:** Place a small, tracking-widest, uppercase label: `NEURAL SIGNAL PLATFORM` (styled in a bright, glowing red).
- **Deep Background Giant Text:** Directly behind the main text block, render a massive, semi-transparent title: `AISIGNAL`. 
  - **Styling:** Set the opacity low (e.g., `rgba(255, 0, 60, 0.04)` to `0.08`), and make it span large behind the other text layers.
- **Foreground Main Title:** Center-align the core tagline: `THE INTELLIGENCE HUB FOR THE AI ERA`. Use high-contrast white with a subtle red drop shadow or neon glow.
- **Centered Paragraph:** Add a neat 2-line description paragraph centered beneath the tagline. Use a muted gray-red color for readability.
- **Central Pill Button:** Align a primary centered CTA button labeled `ENTER NEURAL SIGNAL`. Apply a rich, glowing red box-shadow (`box-shadow: 0 0 15px rgba(255, 0, 60, 0.6)`) and a smooth transition scale on hover.

---

### 4. High-Tech Glassmorphism Stat Cards (Replacing the Corners)
To balance the screen space without utilizing the 3D crystals from Image 1, we will re-home our current database stat cards ("INDEXED NODES: 855", "EDGE LATTICE: 5,187", "ACTIVE SIGNALS: 247") into futuristic floating containers:
- **Card Design:** Wrap each stat inside a glassmorphic card with a very fine red border, sharp monospaced typography, and low-opacity dark-red fill.
- **Placement:**
  - Card 1 (INDEXED NODES) -> Position floating in the **bottom-left quadrant**.
  - Card 2 (EDGE LATTICE) -> Position floating in the **top-right quadrant** (offset slightly below the header CTA).
  - Card 3 (ACTIVE SIGNALS) -> Position floating subtly on the **mid-right margin** of the page to mirror the visual balance in Image 1.

---

### 5. Sidebar & Scroll Signifiers
- **Left Social Column:** Implement a fixed vertical column on the absolute left margin. Place circular button indicators (for social paths or network statuses) with thin red borders that expand on mouse hover.
- **Scroll Mouse Indicator:** Centered at the very bottom, insert a minimal vertical "mouse icon" outline with an animated glowing red dot moving down inside it.
- **Back-to-Top Button:** Add a subtle circular up-arrow in the bottom right corner.

Please analyze the current layout files (HTML/JSX, CSS/Tailwind configs) and output the precise modifications needed to bring this sleek, centered, and interactive structure to life.