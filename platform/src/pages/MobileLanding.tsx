import HeroSection from "../sections/HeroSection";
import FlowSection from "../sections/FlowSection";
import CapabilitySection from "../sections/CapabilitySection";
import PreviewSection from "../sections/PreviewSection";
import GrowthSection from "../sections/GrowthSection";
import BottomNav from "../components/BottomNav";

export default function MobileLanding() {
  return (
    <div className="mobile-landing">
      <HeroSection />
      <FlowSection />
      <CapabilitySection />
      <PreviewSection />
      <GrowthSection />
      <BottomNav />
    </div>
  );
}
