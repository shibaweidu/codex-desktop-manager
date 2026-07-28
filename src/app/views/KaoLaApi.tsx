import { managerApi } from "../../services/managerApi";
import kaolaApiIcon from "../assets/kaola-api.png";
import { Icon } from "../icons";
import { KAO_LA_API_NAME, KAO_LA_API_URL } from "../kaoLaApi";
import { NavBar } from "../components";

export function KaoLaApi({ onBack }: { onBack: () => void }) {
  const openSite = () => void managerApi.openUrl(KAO_LA_API_URL);

  return (
    <div className="pop">
      <NavBar title={KAO_LA_API_NAME} onBack={onBack} />
      <div className="scroll view">
        <section className="hero kaola-api-hero" style={{ paddingTop: 8 }}>
          <img className="kaola-api-icon" src={kaolaApiIcon} alt="Kao La API" />
          <div className="headline">{KAO_LA_API_NAME}</div>
          <div className="kaola-api-description">
            <p>
              <strong>Koala API —— 稳定、高速、高性价比的 AI API 中转平台，比官方价格低80%以上。</strong>
            </p>
            <p>
              一个 API，接入 GPT、Claude、Gemini 等主流模型，兼容 OpenAI 接口，<strong>官方品质，更优价格</strong>，助力开发者快速构建 AI 应用。
            </p>
          </div>
        </section>

        <div className="list">
          <button className="row" onClick={openSite}>
            <Icon name="globe" className="ricon" />
            <span className="rtext">
              <span className="rtitle">Kao La API 中转站</span>
              <span className="rsub">{KAO_LA_API_URL.replace("https://", "")}</span>
            </span>
            <Icon name="external" className="chev" />
          </button>
        </div>

        <div className="actions">
          <button className="btn primary big" onClick={openSite}>
            <Icon name="external" />
            前往中转站
          </button>
        </div>
      </div>
    </div>
  );
}
