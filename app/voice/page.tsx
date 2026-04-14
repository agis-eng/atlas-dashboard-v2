import { VoiceSurface } from "@/components/voice-surface";
import { buildPipecatLaunchUrl, getPipecatBaseUrl } from "@/lib/pipecat";
import { enrichVoiceContext } from "@/lib/voice-context-server";
import { decodeVoiceContext } from "@/lib/voice-context";

export default async function VoicePage(props: PageProps<"/voice">) {
  const searchParams = await props.searchParams;
  const encodedContext = Array.isArray(searchParams.ctx)
    ? searchParams.ctx[0]
    : searchParams.ctx;
  const rawContext = decodeVoiceContext(encodedContext);
  const context = await enrichVoiceContext(rawContext);
  const pipecatBaseUrl = getPipecatBaseUrl();
  const pipecatLaunchUrl = pipecatBaseUrl
    ? buildPipecatLaunchUrl(pipecatBaseUrl, context)
    : null;

  return (
    <VoiceSurface
      context={context}
      pipecatBaseUrl={pipecatBaseUrl}
      pipecatLaunchUrl={pipecatLaunchUrl}
    />
  );
}
