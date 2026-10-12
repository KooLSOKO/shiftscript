import { useEffect, useState } from "react";
export function useMobileView() {
  const [mobile, setMobile] = useState(
    () => matchMedia("(max-width: 850px)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(max-width: 850px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);
  return mobile;
}
