import { managerApi } from "../../services/managerApi";
import { Icon } from "../icons";
import { KAO_LA_API_URL } from "../kaoLaApi";

export function KaoLaApiLink() {
  return (
    <button className="btn primary big kaola-api-link" onClick={() => void managerApi.openUrl(KAO_LA_API_URL)}>
      <Icon name="globe" />
      Kao La API 中转
      <Icon name="external" />
    </button>
  );
}
