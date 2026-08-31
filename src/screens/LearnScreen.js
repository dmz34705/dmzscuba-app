import FeatureCatalogScreen from '../features/catalog/FeatureCatalogScreen';

export default function LearnScreen({ onOpenTool }) {
  return (
    <FeatureCatalogScreen
      area="learn"
      body="Adjust depth, compare outcomes, and build practical intuition at your own pace."
      eyebrow="INTERACTIVE LESSONS"
      footer="An internet connection loads the latest version of each interactive lesson."
      headerEyebrow="DMZ SCUBA ACADEMY"
      onOpenFeature={onOpenTool}
      title="See dive science in motion."
    />
  );
}
