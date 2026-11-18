import FeatureCatalogScreen from '../features/catalog/FeatureCatalogScreen';

export default function ToolsScreen({ onOpenTool, appSettings, onLayoutChange }) {
  return (
    <FeatureCatalogScreen
      appSettings={appSettings}
      onLayoutChange={onLayoutChange}
      area="tools"
      body="Explore dive sites, prepare your gear, and plan your next dive."
      eyebrow="DIVE WORKBENCH"
      headerEyebrow="DMZ SCUBA UTILITIES"
      onOpenFeature={onOpenTool}
      title="The right tool, ready when you need it."
    />
  );
}
