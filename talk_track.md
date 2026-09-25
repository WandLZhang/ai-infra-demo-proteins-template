# Demo Talk Track — *HPC Protein Demo (Generic)*

> Generic slide script for the protein-folding demo. Institution-specific identity
> (name, building, coordinates, login node) is set via the config wizard — this talk
> track covers GCP product features and competitive positioning without naming any
> specific institution's researchers or estates.
>
> Slides are in presentation order; pressing **Enter** advances the deck:
> `home → Multi-Region Burst → Research Apps Catalog → Independent GPU Jobs →
> Data-Anchored Burst → Tightly-Coupled Simulation → TPUs → AI Models`.

---

## 1. HPC Cloud Burst  *(slide: `home`)*

Your institution is evaluating how to extend on-prem HPC into the cloud. Research compute today may be spread across multiple independent estates — departmental clusters, shared institutional HPC, and consortium allocations. The next phase is extending that foundation elastically into the cloud.

Google designs its own silicon, network transport, and datacenter hardware — attributes that make cloud bursting with Google [worth a closer look](https://www.gartner.com/doc/reprints?id=1-2NMT0142&ct=260630&st=sb).

On screen is a terminal on a login node with a Slurm command: `sbatch predict.sh --model=all --target=both --protein=brca1 --requeue --partition=tpu,gpu`. When we press Enter, six inference jobs will dispatch across both TPU and GPU partitions to whichever cloud CONUS regions have capacity.

---

## 2. Multi-Region Burst  *(slide: `dispatching` / `running`)*

A [400 Gbps Dedicated Interconnect](https://cloud.google.com/network-connectivity/docs/interconnect/concepts/overview) is possible to the nearest Google edge, with private IP connectivity, sub-millisecond latency, MACsec encrypted in transit. [Managed Microsoft AD](https://cloud.google.com/managed-microsoft-ad/docs/overview) can bridge on-prem UID/GID into the cloud nodes so researchers log in with the same identity they use today.

This environment shows an operating model of **one Slurm, one identity, one `/data/`** — researchers submit `sbatch` the same way they do on-prem today; Managed AD bridges their UID/GID; Cloud Storage FUSE mounts the same paths. If your institution already runs a condo model — owner partitions plus Slurm preemption letting researchers burst onto idle shared nodes — we extend that same burst surface to GCP.

Slurm's `--requeue` flag handles Spot preemption: if a node is reclaimed, the job retries in the next available zone. Researchers see none of this — they submit `sbatch` and Slurm handles the rest.

---

## 3. Research Applications Catalog  *(slide: `catalog`)*

Research workloads span multiple estates. We organize them into three workload shapes, ordered from quickest cloud win to deepest HPC:

- **Independent GPU Jobs**
- **Data-Anchored Burst**
- **Tightly-Coupled Simulation**

---

## 4. Independent GPU Jobs  *(slide: `pd1`)*

Single-node, single-GPU jobs that fan out embarrassingly parallel — each job runs independently, inputs are small (KB–MB), compute is large. The live demo runs this shape: AlphaFold, ESMFold, and Boltz-2 each on a single GPU or TPU.

- **Protein structure prediction** — AlphaFold2, ZDOCK, molecular docking. Per-interaction deep learning that fans out cleanly onto single-GPU nodes.
- **Single-cell and epigenomic pipelines** — Hi-C, ChIP-seq, CUT&RUN, ATAC-seq. Each sample is its own batch job.
- **ML model training** — hyperparameter sweeps, fine-tuning, reinforcement learning. Embarrassingly parallel across GPU nodes.
- **Medical imaging AI** — pathology slides, radiology, MRI. PyTorch models that ran on shared consortium GPUs can land on GCP in minutes instead of waiting in queue.

Model weights are served from [Hyperdisk ML](https://docs.google.com/kubernetes-engine/docs/how-to/persistent-volumes/hyperdisk-ml). **One volume serves 2,500 instances at 1.2 TiB/s aggregate**. An admin creates the volume and loads weights once; researchers' job scripts just read a local path.

One layer up at the host, [BoltVMs](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/fast-starting-nodes) are pre-initialized GPU nodes that keep the boot, driver, and container runtime warm — **H100 cold-start drops from 15 minutes to 2**.

And at the workload layer, [Pod Snapshots](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/checkpoint-restore) snapshot full pod state and restore in seconds — **80% faster warm restart for a 70B-parameter model**. Standard K8s pod restart in AWS EKS or AKS reloads model weights from scratch.

---

## 5. Consumption Models  *(slide: `pd2`)*

The background sbatch demo follows the Independent GPU Jobs pattern, dispatching across consumption models:

- [**3-Year CUD + Zonal Reservation**](https://cloud.google.com/compute/docs/instances/committed-use-discounts-overview) — Lowest cost tier — competitive with on-prem $/GPU-hr. Locks in pricing for the full term; the reservation guarantees the hardware is there.
- [**DWS Flex Start**](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/dws) — **guaranteed GPU or TPU capacity for up to 7 days per request**, with no reservation contract or minimum commitment. AWS Capacity Blocks require fixed-duration commitment and rigid sizing. AWS also [raised H200 prices 15%](https://www.datacenterknowledge.com/cloud/aws-raises-h200-prices) recently.
- [**Calendar Mode**](https://docs.cloud.google.com/compute/docs/instances/future-reservations-calendar-mode-overview) — pick a start date and lock in guaranteed capacity for **up to 90 days**. Useful for runs planned against grant milestones.

Google's [GKE hypercluster](https://cloud.google.com/blog/products/containers-kubernetes/whats-new-in-gke-at-next26) **manages 1 million chips across 256,000 nodes spanning multiple regions under a single control plane**. AWS announced EKS at 100,000 nodes in July 2025.

[Custom Compute Classes](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/about-compute-classes) act as the routing policy engine across all three workload shapes — Independent GPU Jobs fan across TPU+GPU, Data-Anchored Burst stages from the shared multi-region bucket, and Tightly-Coupled Simulation heads to compute-optimized HPC VMs with RDMA — without the researcher choosing the backend.

---

## 6. Independent GPU Jobs: Fractional & Serverless  *(slide: `img`)*

Not every model needs a full H100. [G4 fractional GPUs](https://docs.cloud.google.com/compute/docs/accelerator-optimized-machines#g4-series) carve up an NVIDIA RTX PRO 6000 Blackwell into **1/8, 1/4, or 1/2 slices via vGPU**. AWS G5g ships whole L4 instances only — no native fractional split. Azure NCv supports MIG but does not offer vGPU sub-VM shapes.

For clinical inference — radiology endpoints, real-time microscopy — [serverless Cloud Run with GPUs](https://cloud.google.com/run/docs/configuring/services/gpu) serves the fine-tuned model as a managed endpoint. **L4 (24 GB) or RTX PRO 6000 Blackwell (96 GB), 5-second cold start, scale-to-zero, per-second billing**. AWS Lambda has no GPU support. AWS App Runner has no GPU support. [Azure Container Apps Serverless GPU](https://learn.microsoft.com/en-us/azure/container-apps/gpu-serverless-overview) caps at A100 80 GB.

- **NLP and topic modeling** — digital-humanities text corpora, document classification. L4-class fractional inference.
- **Point-of-care diagnostics** — mobile health platforms, colorimetric assays. Scale-to-zero L4 endpoints on Cloud Run.
- **Real-time microscopy** — high-frame-rate acquisition with GPU-accelerated reconstruction, served as a managed endpoint on Cloud Run.

---

## 7. Data-Anchored Burst: Storage  *(slide: `catalog2`)*

Input datasets are large — hundreds of GB per session — but static per experiment, making this an ideal burst profile. The compute is often single-GPU per task. the prework is incrementally syncing predetermined parts of the shared filesystem using [Storage Transfer Service](https://cloud.google.com/storage-transfer/docs/overview).

- **Synchrotron beamline data** — SAXS, crystallography. Each beamtime produces a write-heavy burst of detector images followed by read-intensive reduction. Synchrotrons run over a thousand scientists/year, generating hundreds of TB per run where detector brightness is outrunning on-prem compute.
- **Cryo-EM movie datasets** — CryoSPARC, RELION, ChimeraX, Phenix. Multi-terabyte data written once, then read repeatedly through motion-correction and 3D classification.
- **Genomic sequencing archives** — decades of immutable sequencing data reprocessed in batch through alignment and peak-calling pipelines.
- **Quantum-matter or high-energy-physics imaging** — terabyte-scale datasets with the same write-once, read-many profile.

Compute nodes in every burst region mount the same `/data/` paths from one multi-region bucket via [Cloud Storage FUSE](https://cloud.google.com/storage/docs/cloud-storage-fuse/overview) — one shared namespace everywhere, read anywhere and write results back.

---

## 8. Data-Anchored Burst: Caching  *(slide: `catalog3`)*

[Rapid Cache](https://docs.cloud.google.com/storage/docs/rapid/rapid-cache) puts an SSD-backed zonal cache in each burst region in front of the multi-region bucket at **2.5 TB/s, sub-millisecond latency** — repeated reads are served locally, so you don't re-pay cross-region transfer on cache hits.

[Image Streaming](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/image-streaming) has a workload starting in seconds even on 60GB containers.

---

## 9. Data-Anchored Burst: vs AWS & Azure  *(slide: `catalog4`)*

**AWS S3** has no multi-region buckets. [Multi-Region Access Points](https://docs.aws.amazon.com/AmazonS3/latest/userguide/MultiRegionAccessPoints.html) route requests intelligently, but each object still lives in a single region, so cross-region egress both accrue on every cache miss. [Mountpoint for S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mountpoint.html) reached general availability in 2023, giving it years less production exposure than [Cloud Storage FUSE](https://cloud.google.com/storage/docs/cloud-storage-fuse/overview), and there is no S3 equivalent to [Rapid Cache](https://docs.cloud.google.com/storage/docs/rapid/rapid-cache) at any tier.

**Azure Blob Storage** is region-pinned with no multi-region bucket equivalent in its catalog, and Azure caps useful [image streaming](https://learn.microsoft.com/en-us/azure/aks/artifact-streaming) around 30 GB — half the headroom Google ships.

---

## 10. Tightly-Coupled Simulation  *(slide: `md1`)*

Tightly-coupled MPI simulation — molecular dynamics, computational fluid dynamics, and finite-element multiphysics. Multi-node, latency-sensitive, anchored in one region.

- **Molecular dynamics** — replica-exchange MD, free-energy perturbation, long-duration trajectories of signaling proteins. Many tightly-coupled ranks exchanging state, the canonical communication-bound HPC pattern.
- **Finite-element multiphysics** — COMSOL, structural mechanics, soft-matter modeling. Coupled-physics solvers that span multiple nodes.
- **Computational fluid dynamics** — both classical MPI solvers and ML-native differentiable CFD in [JAX](https://jax.readthedocs.io/), Google's own framework, embedding PDE operators directly into neural nets.

The hot scratch tier is zonal. Two options serve this profile: [Managed Lustre](https://docs.cloud.google.com/managed-lustre/docs/overview) with full POSIX, sub-millisecond latency at **10 TB/s** (AWS FSx for Lustre caps around 2 TB/s) or [Rapid Bucket](https://docs.cloud.google.com/storage/docs/rapid/rapid-bucket) with **15 TB/s, 20 million QPS** suited to streaming checkpoints.
Hierarchical namespaces in buckets allow elegant folder renames — a finished job commits with an atomic, metadata-only rename: `gcloud storage mv gs://your-institution/Refine3D/job001.staging gs://your-institution/Refine3D/job001` updates the path without copying or deleting the underlying files, where AWS can only rename one object at a time, not whole directories.

---

## 11. H4D + Cloud RDMA (Falcon)  *(slide: `md2`)*

[H4D](https://cloud.google.com/blog/products/compute/new-h4d-vms-optimized-for-hpc) is the HPC-optimized VM, purpose-built for tightly-coupled MPI. Hardware: **5th-gen AMD EPYC Turin, 192 vCPUs, up to 1.5 TB RAM, 200 Gbps** [Cloud RDMA](https://docs.cloud.google.com/compute/docs/instances/create-vm-with-rdma) via [Falcon](https://cloud.google.com/blog/products/networking/understanding-cloud-rdma-scalable-high-performance-networking), higher RAM and newer CPU generation than competitors. Published benchmarks: [GROMACS Lignocellulose](https://cloud.google.com/blog/products/compute/new-h4d-vms-optimized-for-hpc) at **2.8x over TCP** on 32 VMs with Falcon; Ansys Fluent **4.1x vs C2D**; OpenFOAM **5.2x vs C2D with 122% superlinear efficiency**.

---

## 12. Five MPI-Specific Google Features  *(slide: `md3`)*

Tightly-coupled simulation highlights these unique Google features:

- [**Topology-aware Slurm via Cluster Director**](https://docs.cloud.google.com/cluster-director/docs/orchestration) — [AWS and Azure do not expose the hierarchy to the scheduler — placement is random](https://docs.cloud.google.com/ai-hypercomputer/docs/networking-overview), vs. Cluster Director can colocate on the same rack.
- [**Multi-Tier Checkpointing**](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/machine-learning/training/multi-tier-checkpointing) — writes to local RAM disk, replicates to peer nodes, async-uploads to Cloud Storage. When a long-running job restarts, it pulls from the nearest tier: local SSD first, peer node next, GCS last.
- [**Node Health Prediction**](https://docs.cloud.google.com/ai-hypercomputer/docs/workloads/enable-node-health-prediction) — predicts which nodes will degrade in the next 5 hours based on metadata, heat, and packet integrity, and drains them before disruptive symptoms surface. AWS SageMaker notifies after the fact.
- [**Optical Circuit Switching (Palomar)**](https://cloud.google.com/blog/products/networking/introducing-virgo-megascale-data-center-fabric) — when a chip fails mid-job, OCS physically reroutes the topology around the failed chip without restarting. Anthropic uses this to survive daily failures across 1 million chips.
- [**Goodput**](https://cloud.google.com/blog/products/ai-machine-learning/goodput-metric-as-measure-of-ml-productivity) — paid compute hours that were actually productive. Google publishes this as a service-level indicator, and Cluster Director optimizes for it.

---

## 13. TPUs  *(slide: `tpu1`)*

Six organizations that evaluated NVIDIA and TPU at scale and chose TPU for their most demanding workloads:

- [Anthropic](https://www.anthropic.com/news/expanding-our-use-of-google-cloud-tpus-and-services) — **up to 1 million TPU chips for Claude**. The largest AI infrastructure commitment in the industry.
- [OpenAI](https://www.networkworld.com/article/4015386/openai-tests-google-tpus-amid-rising-inference-cost-concerns.html) — production ChatGPT inference on TPU. Industry analysts put the savings at **20–40% cheaper than equivalent GPU inference**. Multi-year commitment, deepened with Ironwood (TPU v7) capacity.
- [Apple](https://machinelearning.apple.com/research/introducing-apple-foundation-models) — trained Apple Foundation Models on **8,192 TPUv4 chips with 52% sustained MFU**.
- [Meta](https://siliconangle.com/2026/02/26/google-meta-reportedly-strike-new-multibillion-dollar-ai-chip-deal/) — **multi-billion-dollar TPU lease in February 2026** for Llama training. Meta operates the largest single NVIDIA cluster in the industry (100,000+ H100s); they are diversifying, not switching, because TPU economics on inference and ranking workloads beat the GPU stack they already operate.
- [Midjourney](https://cloud.google.com/customers/midjourney) — **monthly compute went from $2 million to $700,000** after migrating to TPU.
- [Recursion Pharmaceuticals](https://cloud.google.com/customers/recursion) — drug discovery on TPU at scale.

Google reports approximately [90% of generative AI unicorns](https://cloud.google.com/ai-infrastructure) run on Google Cloud AI infrastructure.

---

## 14. Why TPU Economics Are Structural  *(slide: `tpu2`)*

TPU TCO per hour is **30% lower than NVIDIA GB200 and 41% lower than GB300**, per [SemiAnalysis](https://newsletter.semianalysis.com/p/tpuv7-google-takes-a-swing-at-the). Realized model FLOPS utilization is **40% on TPU versus 30% on GPU — 52% lower cost per effective petaFLOP** (Anthropic's [67% price cut on Claude Opus 4.5](https://www.anthropic.com/news/claude-opus-4-5) is a direct consequence of running on TPU).

Power matters too. A TPU v7 rack draws **70 kW versus 120 kW for an NVIDIA GB200 NVL72 rack** — 42% less power per rack — relevant for any institution tracking per-petaFLOP power as a sustainability metric.

---

## 15. TorchTPU: ESMFold in 4 Lines  *(slide: `tpu3`)*

Researchers are familiar with PyTorch. Historically TPU required JAX. [TorchTPU](https://developers.googleblog.com/torchtpu-running-pytorch-natively-on-tpus-at-google-scale/) eliminates that requirement by running PyTorch natively on TPU.

- **RLHF training pipelines** — DeepSpeed, vLLM, FlashAttention-2, HuggingFace Accelerate on Llama-class models. This is the PyTorch stack TorchTPU targets.
- **Gaussian process and Bayesian ML** — libraries like GPyTorch are PyTorch-native research that runs on TPU without rewriting in JAX.

ESMFold demonstrates the minimal case. The diff between the [GPU backend](https://github.com/WandLZhang/ai-infra-demo-proteins/blob/main/backends/esmfold-gpu/predict.py) and the [TPU backend](https://github.com/WandLZhang/ai-infra-demo-proteins/blob/main/backends/esmfold-tpu/predict.py) on the inference path is **four lines**:

```python
import torch
import torch_xla                              # NEW
torch_xla.experimental.eager_mode(True)       # NEW
import torch_xla.core.xla_model as xm         # NEW

device = xm.xla_device()                      # CHANGED (was "cuda")
model = EsmForProteinFolding.from_pretrained(_MODEL_ID).to(device)
with torch.no_grad():
    output = model(**inputs)
```

---

## 16. AI Models Only Google Has  *(slide: `models1`)*

In the [Nature Index corporate research rankings](https://www.nature.com/nature-index/research-leaders/2025/institution/corporate/all/global), **Alphabet is #3 globally**, behind only Roche and AstraZeneca. **Microsoft is #27. Amazon is #90.** Google publishes **300+ health publications a year, 15+ in JAMA, 50+ in Nature**.

**Science model catalog:**

- [**AlphaFold**](https://deepmind.google/technologies/alphafold/) — Nobel Prize in Chemistry 2024 (John Jumper). [Used by 3 million researchers across 190+ countries as of Q1 2026](https://deepmind.google/blog/alphafold-five-years-of-impact/), the most-cited tool in life-science AI history.
- [**AlphaGenome**](https://deepmind.google/science/alphagenome/) — predicts 5,930 human genome tracks across diverse cell types and 11 output modalities. Cracks the 98% of non-coding DNA that no prior model could meaningfully interpret.
- [**AI Co-Scientist**](https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/) — proposed the same antimicrobial-resistance hypothesis Prof. Jose Penades' Imperial College lab had reached through a decade of bench work — in hours, not years, which Stanford's Gary Peltz, who used it to identify the cancer drug Vorinostat as a liver-fibrosis candidate, [called *"consulting the oracle of Delphi"*](https://www.technologyreview.com/2026/05/22/1137813/google-i-o-showed-how-the-path-for-ai-science-is-shifting/) ([*Cell*, Sep 2025](https://www.cell.com/cell/fulltext/S0092-8674(25)00973-0); [*Advanced Science*, Sep 2025](https://advanced.onlinelibrary.wiley.com/doi/10.1002/advs.202508751)).
- [**ERA (Empirical Research Assistance)**](https://blog.google/innovation-and-ai/technology/research/gemini-for-science-io-2026/) — beat the CDC's own COVID-19 hospitalization forecasting ensemble in head-to-head benchmarks ([*Nature*, May 2026](https://www.nature.com/articles/s41586-026-10658-6)).
- [**AlphaEvolve**](https://deepmind.google/technologies/alphaevolve/) — agentic research engine that generates and scores thousands of algorithm variations in parallel. Manufacturing companies are using it in production to accelerate supply-chain decisions across global networks.
- [**WeatherNext**](https://research.google/blog/fast-accurate-climate-modeling-with-neuralgcm/) — highlighted in I/O keynote as providing advance landfall warning for Hurricane Melissa to Jamaica that likely saved lives.
- [**DeepVariant**](https://github.com/google/deepvariant), [**TxGemma-9B**](https://cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models), [**MedSigLIP**](https://cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models), [**AlphaEarth Foundations**](https://deepmind.google/technologies/alphaearth/), and many more — variant calling, therapeutic LLM, medical multimodal, environmental sensing.

---

## 17. Google Science Bench  *(slide: `models2`)*

James Manyika and Pushmeet Kohli launched an agentic platform aimed at automating the most labor-intensive phases of research, called [Gemini for Science](https://blog.google/innovation-and-ai/technology/research/gemini-for-science-io-2026/). Register at [labs.google/science](https://labs.google/science).

- **Hypothesis Generation** (built on Co-Scientist) — multi-agent *"idea tournament"* where hypotheses are generated, debated, and verified with clickable citations.
- **Computational Discovery** (built on AlphaEvolve + ERA) — parallel code-variant search for scientific simulation.
- **Literature Insights** — agentic synthesis across the published corpus.

[**Science Skills**](https://github.com/google-deepmind/science-skills) is a bundle that connects [**Google Antigravity**](https://antigravity.google/) agents to **30+ life-science databases**: UniProt, AlphaFold Database, AlphaGenome API, InterPro, and more. In Google's internal validation, a structural bioinformatics analysis on the **AK2 gene** that normally takes hours completed in **minutes**, surfacing new disease mechanism candidates. For your structural biologists, this collapses days of manual workflow into a single prompt.

---

## 18. Ecosystem Partnerships  *(slide: `models3`)*

Academic medical precedents for AI infrastructure: [CHOP](https://cloud.google.com/customers/chop) (Trillium TPUs for 1.6M pediatric patients), [CMU](https://www.cmu.edu/news/stories/archives/2025/March/google-partnership), [Purdue](https://www.purdue.edu/newsroom/2026/Q1/purdue-and-google-public-sector-partner-to-scale-ai-integration-and-accelerate-education-and-research-across-the-institution/) (256-chip TPU pod with Slurm), SUNY (64 campuses), [ODU](https://www.odu.edu/article/old-dominion-university-and-google-launch-a-first-of-its-kind-ai-incubator-for-higher).

Google invented the technological substrate underneath all of this: the [Transformer](https://arxiv.org/abs/1706.03762), [TensorFlow](https://www.tensorflow.org/), [Kubernetes](https://kubernetes.io/), [JAX](https://jax.readthedocs.io/). The infrastructure we walked through today — Slurm-burst, TPU, Hyperdisk ML, Falcon, Multi-Tier Checkpointing — exists because the science layer above demands it. Your institution gets both halves of the stack from a single vendor with the deepest scientific publication record in the industry.

---

## 19. Public Sector Economics  *(slide: `pse`)*

PSSA (Public Sector Subscription Agreement) provides fixed-price predictability for government and higher education. Unlike consumption-based billing, PSSA locks in pricing for a committed term with no usage surprises — a single fixed annual line item that maps to how institutional HPC is already funded (O&M contributions, not per-researcher metering).

[GPAR (Google Public Sector Program for Accelerated Research)](https://cloud.google.com/edu/researchers) is the research-side credit framing that complements PSSA. In production with SUNY, ODU, Purdue, and CMU.

For NIH-funded institutions, both sit under [STRIDES](https://datascience.nih.gov/strides) — the NIH framework Google has been the [first commercial cloud partner under since 2018](https://www.hpcwire.com/2018/07/31/google-is-first-partner-in-nihs-strides-effort-to-speed-discovery-in-the-cloud/). Eight years of co-design with NIH on how cloud research procurement works for institutional budgets.
