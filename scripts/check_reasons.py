from backend.vericems.detectors.verifier import load_proposed_detector
from backend.vericems.gateway import GatewaySimulator
from backend.vericems.orchestrator import _scale_co2_30pct

gw = GatewaySimulator(1073, 3, device_id="DEV-STEEL-001")
res1 = gw.replay_batch(batch_size=8, offset=0)
gw.before_sign_hook = _scale_co2_30pct
res2 = gw.replay_batch(batch_size=8, offset=8)
det = load_proposed_detector()
verdict = det.verify_batch(res2["packets"])
print("VERDICT:", verdict.verdict)
print("SCORE_BP:", verdict.score_bp)
print("REASONS:", verdict.reason_codes)
