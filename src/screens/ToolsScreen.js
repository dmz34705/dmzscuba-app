import FeatureCatalogScreen from '../features/catalog/FeatureCatalogScreen';

export default function ToolsScreen({ onOpenTool }) {
  return (
    <FeatureCatalogScreen
      area="tools"
      body="Planning, gas, identification, and future field utilities stay organized in one place."
      eyebrow="DIVE WORKBENCH"
      headerEyebrow="DMZ SCUBA UTILITIES"
      onOpenFeature={onOpenTool}
      title="The right tool, ready when you need it."
    />
  );
}
