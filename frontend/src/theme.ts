export const colors = {
  surface: "#FDFBF7",
  onSurface: "#2B1D16",
  surfaceSecondary: "#F4EFE6",
  onSurfaceSecondary: "#4A3528",
  surfaceTertiary: "#E8DFD1",
  onSurfaceTertiary: "#3E2B1F",
  surfaceInverse: "#2B1D16",
  onSurfaceInverse: "#FDFBF7",
  brand: "#C4442A",
  brandPrimary: "#C4442A",
  onBrandPrimary: "#FDFBF7",
  brandSecondary: "#1D3B87",
  onBrandSecondary: "#FDFBF7",
  brandTertiary: "#F2A628",
  onBrandTertiary: "#1D3B87",
  success: "#5D7A62",
  onSuccess: "#FFFFFF",
  warning: "#D99441",
  onWarning: "#FFFFFF",
  error: "#A8463F",
  onError: "#FFFFFF",
  border: "#DCD3C6",
  borderStrong: "#8C3A35",
  divider: "#E6DFD6",
  muted: "#8B7B6A",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 12,
  lg: 20,
  pill: 999,
};

export const fonts = {
  display: "serif",
  text: "System",
};

export const images = {
  venue_hero:
    "https://images.unsplash.com/photo-1768858311094-62a0d2546c57?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA2MjJ8MHwxfHNlYXJjaHwyfHxjb3VudHJ5JTIwbGluZSUyMGRhbmNpbmclMjBib290c3xlbnwwfHx8fDE3ODQxNjE0NDV8MA&ixlib=rb-4.1.0&q=85",
  library_banner:
    "https://images.unsplash.com/photo-1731848357705-d9883b01ef94?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2Njd8MHwxfHNlYXJjaHwyfHxwZW9wbGUlMjBsaW5lJTIwZGFuY2luZyUyMGNvdW50cnklMjBiYXJ8ZW58MHx8fHwxNzg0MTYxNDQ1fDA&ixlib=rb-4.1.0&q=85",
  profile_cover:
    "https://images.unsplash.com/photo-1571829604981-ea159f94e5ad?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjAzMzN8MHwxfHNlYXJjaHwxfHxsZWF0aGVyJTIwdGV4dHVyZSUyMGJhY2tncm91bmQlMjBydXN0aWN8ZW58MHx8fHwxNzg0MTYxNDQ1fDA&ixlib=rb-4.1.0&q=85",
  // Full designed poster used as the Home hero. Local asset (ships with the
  // bundle) so it renders instantly with no network flash. The poster
  // already bakes in the logo + "More Than Steps... It's Community"
  // tagline + community-value icons, so the Home hero does NOT overlay any
  // additional text/logo on top of it.
  home_hero_local: require("../assets/images/home-community-bg.jpg"),
};

export const difficultyColor = (d: string): string => {
  const k = (d || "").toLowerCase();
  // Softer sage — reads as "even more welcoming than Beginner".
  if (k === "absolute beginner") return "#A8CB92";
  if (k === "beginner") return colors.success;
  if (k === "improver") return colors.brandSecondary;
  // "High Improver" sits between Improver (deep blue) and Intermediate
  // (warm orange). A violet-blue reads distinctly from both while still
  // feeling like a natural next-step-up on the difficulty spectrum.
  if (k === "high improver") return "#5B4B9E";
  if (k === "intermediate") return colors.warning;
  if (k === "advanced") return colors.error;
  return colors.brandTertiary;
};
