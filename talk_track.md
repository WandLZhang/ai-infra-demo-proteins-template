# HPC Protein Demo: talk track

The run of show, slide by slide. Each slide's text is the collapsed panel under its step. Lines that start with `>` are presenter notes and stay off the slide.

Words in braces come from `src/config/institution.config.ts` when the slide shows: `{institution}` is the short name, and `{examples:pd1}` is the list of researchers or workloads on that slide. The full list is at the top of that file. A fork edits the config and leaves this file alone.

After editing a panel, run `node scripts/sync-talk-track.mjs` to copy the text into `src/App.tsx`. With `--check`, it exits 1 while App.tsx is out of date.

## Run of show

The map opens on {institution}'s campus.

<details><summary>(i) panel: Research Computing at {institution}</summary>
<!-- slide: `home` -->

{intro}

Google designs its own silicon, network transport, and datacenter hardware — attributes that make cloud bursting with Google [worth a closer look](https://www.gartner.com/doc/reprints?id=1-2NMT0142&ct=260630&st=sb). [Gartner estimates](https://www.gartner.com/doc/reprints?id=1-2NMT0142&ct=260630&st=sb) Google holds about a quarter of the world's cumulative AI compute capacity.

On screen is a {institution} [login node]({controllerConsoleHref}) with the command `sbatch predict.sh --model=all --target=both --protein=brca1 --requeue --partition=tpu,gpu`. When we press Enter, six inference jobs fan out from that login node to whichever Google Cloud regions have capacity.

</details>

1. **Click** the map, then **press** Enter. The jobs fan out across the US and the map shows Multi-Region Burst.

<details><summary>(i) panel: Multi-Region Burst</summary>
<!-- slide: `dispatching` / `running` -->

[Managed Microsoft AD](https://cloud.google.com/managed-microsoft-ad/docs/overview) can bridge on-prem [UID/GID](https://docs.cloud.google.com/filestore/docs/configure-nfsv4-managed-ad) into the cloud nodes so researchers log in with the same identity they use today.

> (open burst vm)

This environment shows an operating model of **one Slurm, one identity, one `/data/`**. {institution} researchers keep typing `sbatch` on `{loginNode}`, the cloud partitions sit behind the same scheduler, and Slurm's `--requeue` retries a preempted job in the next zone with capacity.

By the way, these data centers carry Google Cloud's [FedRAMP High authorization](https://cloud.google.com/security/compliance/fedramp), so there's no separate GovCloud, and HIPAA work runs under Google's [BAA](https://cloud.google.com/security/compliance/hipaa).

</details>

2. **Press** → for each slide below. ← goes back.

<details><summary>(i) panel: {institution}'s Workloads, Three Shapes</summary>
<!-- slide: `catalog` -->

{institution}'s research computing fits three workload shapes, from quickest cloud win to deepest HPC:

- **Independent GPU Jobs**{catalog:pd}
- **Data-Anchored Burst**{catalog:db}
- **Tightly-Coupled Simulation**{catalog:md}

</details>

<details><summary>(i) panel: Independent GPU Jobs</summary>
<!-- slide: `pd1` -->

Single-node, single-accelerator jobs that fan out embarrassingly parallel. The live demo runs this shape: AlphaFold, ESMFold, and Boltz-2 each on a single GPU or TPU.

{examples:pd1}

To scale inference, an admin can preload model weights onto [Hyperdisk ML](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/persistent-volumes/hyperdisk-ml) once. **One volume serves 2,500 instances at 1.2 TiB/s aggregate**, and loads weights up to 11.9× faster than a model registry.

One layer up at the host, [BoltVMs](https://cloud.google.com/kubernetes-engine/docs/concepts/fast-starting-nodes) are pre-initialized GPU nodes that keep the boot, driver, and container runtime warm — **GPU cold-start drops from 15 minutes to 2**.

And at the workload layer, [Pod Snapshots](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/pod-snapshots) restore full pod state in seconds — **89% faster startup for a 70B-parameter model**. Compare with EKS or AKS where pod restart loads model weights from scratch.

One [GKE](https://cloud.google.com/blog/products/containers-kubernetes/whats-new-in-gke-at-next26) control plane manages **256,000 nodes**. AWS [announced EKS at 100,000 nodes](https://aws.amazon.com/about-aws/whats-new/2025/07/amazon-eks-100000-worker-nodes-per-cluster/) in July 2025.

</details>

<details><summary>(i) panel: Consumption Models</summary>
<!-- slide: `pd2` -->

Three ways to pay:

- **Spot**: the live run tries Spot nodes first. Slurm moves jobs from low-resource zones to a standard partition.
- [**DWS Flex Start**](https://docs.cloud.google.com/kubernetes-engine/docs/concepts/dws): **guaranteed GPU or TPU capacity for up to 7 days per request**, with no reservation contract or minimum commitment. AWS Capacity Blocks require fixed-duration commitment and rigid sizing. AWS also [raised H200 prices 15%](https://www.theregister.com/off-prem/2026/01/05/aws-raises-gpu-prices-15-on-a-saturday/2652706) recently.
- [**Calendar Mode**](https://docs.cloud.google.com/compute/docs/instances/future-reservations-calendar-mode-overview): pick a start date and lock in guaranteed capacity for **up to 90 days**, for runs planned against grant milestones.

{examples:pd2}

</details>

<details><summary>(i) panel: Independent GPU Jobs: Fractional & Serverless</summary>
<!-- slide: `img` -->

Not every model needs a full GPU node. [Fractional GPUs](https://docs.cloud.google.com/compute/docs/accelerator-optimized-machines#g4-series) carve up an NVIDIA RTX PRO 6000 Blackwell into **1/8, 1/4, or 1/2 slices via vGPU**. A whole one holds 96 GB.

For live inference, [serverless Cloud Run with GPUs](https://cloud.google.com/run/docs/configuring/services/gpu) can serve GPUs as a managed endpoint. **RTX PRO 6000 Blackwell (96 GB), 5-second cold start, scale-to-zero, per-second billing**. AWS Lambda has no GPU support. AWS App Runner has no GPU support. [Azure Container Apps Serverless GPU](https://learn.microsoft.com/en-us/azure/container-apps/gpu-serverless-overview) caps at A100 80 GB.

{examples:img}

</details>

<details><summary>(i) panel: Data-Anchored Burst: Storage</summary>
<!-- slide: `catalog2` -->

Input datasets are large — hundreds of GB per session — but static per experiment, making this workload shape ideal for cloud bursting too. The prework incrementally syncs the cluster's shared filesystem, using [Storage Transfer Service](https://cloud.google.com/storage-transfer/docs/overview).

Compute nodes in every burst region mount the same `/data/` paths from one multi-region bucket via [Cloud Storage FUSE](https://cloud.google.com/storage/docs/cloud-storage-fuse/overview) — one shared namespace everywhere, read anywhere and write results back.

{examples:catalog2}

</details>

<details><summary>(i) panel: Data-Anchored Burst: vs AWS & Azure</summary>
<!-- slide: `catalog4` -->

[Rapid Cache](https://docs.cloud.google.com/storage/docs/rapid/rapid-cache) puts an SSD-backed zonal cache in each burst region in front of the multi-region bucket at **2.5 TB/s, [sub-millisecond latency](https://discuss.google.dev/t/how-to-build-an-elastic-scalable-llm-inference-platform-on-gke-using-fluid-compute/388108)**. Mountpoint for Amazon S3's shared cache holds only [objects up to 1 MB](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mountpoint-usage.html).

**AWS S3** and **Azure Blob** have no multi-region buckets. S3 stitches one bucket per region together with replication that [lags by minutes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-troubleshoot.html). Azure's [paired-region copy](https://learn.microsoft.com/en-us/azure/storage/common/storage-redundancy) takes no writes until a failover. A Google [multi-region bucket](https://docs.cloud.google.com/storage/docs/locations) is one bucket, and a read after a write [is never stale](https://docs.cloud.google.com/storage/docs/consistency).

</details>

<details><summary>(i) panel: Tightly-Coupled Simulation</summary>
<!-- slide: `md1` -->

Tightly-coupled MPI simulation — molecular dynamics, CFD, and finite-element multiphysics. Multi-node, latency-sensitive, anchored in one region.

{examples:md1}

Two storage options serve this shape: [Managed Lustre](https://docs.cloud.google.com/managed-lustre/docs/overview) with full POSIX, sub-millisecond latency at **10 TB/s** (AWS FSx for Lustre caps around 2 TB/s), or [Rapid Bucket](https://docs.cloud.google.com/storage/docs/rapid/rapid-bucket), with **15 TB/s, 20 million QPS** suited to streaming checkpoints.

Hierarchical namespaces in buckets allow elegant folder renames — a finished job commits with an atomic, metadata-only rename: `gcloud storage mv {bucket}/namd/run042.staging {bucket}/namd/run042` updates the path without copying or deleting the underlying files, where AWS can only rename one object at a time, not whole directories.

</details>

<details><summary>(i) panel: H4D + Cloud RDMA (Falcon)</summary>
<!-- slide: `md2` -->

[H4D](https://cloud.google.com/blog/products/compute/new-h4d-vms-optimized-for-hpc) is the HPC-optimized VM, purpose-built for tightly-coupled MPI:

- **192 physical cores**, SMT off, no overcommit, one VM per host ([H4D](https://docs.cloud.google.com/compute/docs/compute-optimized-machines#h4d_series)); `h4d-standard-192` has 720 GB and `h4d-highmem-192` has 1,488 GB
- 5th-gen AMD EPYC Turin (EPYC 9B45): 2.7 GHz base, 3.5 GHz effective, 4.1 GHz max boost ([CPU platforms](https://docs.cloud.google.com/compute/docs/cpu-platforms))
- **200 Gb/s [Cloud RDMA](https://docs.cloud.google.com/compute/docs/instances/create-vm-with-rdma)** over Google's [Falcon](https://cloud.google.com/blog/topics/systems/introducing-falcon-a-reliable-low-latency-hardware-transport) transport, with Intel MPI and Open MPI ([MPI guide](https://docs.cloud.google.com/cluster-toolkit/docs/setup/configure-mpi-application))

No HPC VM on [AWS](https://docs.aws.amazon.com/ec2/latest/instancetypes/hpc.html) or [Azure](https://learn.microsoft.com/en-us/azure/virtual-machines/sizes/high-performance-compute/hx-series) pairs AMD's newest EPYC with more than 1 TB of memory.

Published results from the [H4D GA announcement](https://cloud.google.com/blog/products/compute/h4d-vms-now-ga): OpenFOAM Motorbike_100M **5.2× over C2D at 16 VMs with 122% efficiency** and Ansys Fluent F1_RaceCar_140M **4.1× at 32 VMs**. RDMA alone is worth **3.4× over TCP** on OpenFOAM at 4 VMs and **2.8×** on GROMACS at 32 VMs.

</details>

<details><summary>(i) panel: Long Jobs Route Around Failures</summary>
<!-- slide: `md3` -->

Tightly-coupled simulation highlights these unique Google features:

- [**Cluster Director**](https://docs.cloud.google.com/cluster-director/docs/orchestration) — topology-aware Slurm that places the ranks of one job on the same rack.
- [**Node Health Prediction**](https://docs.cloud.google.com/ai-hypercomputer/docs/workloads/enable-node-health-prediction) flags GPU nodes likely to degrade within the next five hours, so new work skips them. [AWS HyperPod](https://docs.aws.amazon.com/sagemaker/latest/dg/sagemaker-hyperpod-resiliency-slurm.html) replaces a node only after its health checks fail.
- **Optical circuit switches** [rewire a TPU pod around a dead chip in seconds](https://newsletter.semianalysis.com/p/tpu-inferencex-full-steam).
- [**Goodput**](https://cloud.google.com/blog/products/ai-machine-learning/goodput-metric-as-measure-of-ml-productivity) — paid compute hours that were actually productive. Google [publishes this as a service-level indicator](https://docs.cloud.google.com/ai-hypercomputer/docs/monitor), and Cluster Director optimizes for it.

</details>

<details><summary>(i) panel: TPUs</summary>
<!-- slide: `tpu1` -->

[90% of generative AI unicorns](https://cloud.google.com/blog/topics/google-cloud-next/welcome-to-google-cloud-next24) run on Google Cloud AI infrastructure. Google builds that stack end to end, from its own hardware up to its models, and offers frontier silicon on both paths, TPU and NVIDIA. [Gartner](https://www.gartner.com/doc/reprints?id=1-2NMT0142&ct=260630&st=sb) positions Google's TPUs as reducing *"the dependency on the clogged supply chain of NVIDIA."* Five organizations that run AI on TPU:

- [Anthropic](https://www.anthropic.com/news/expanding-our-use-of-google-cloud-tpus-and-services) — **up to 1 million TPU chips for Claude**. In April 2026 it [added multiple gigawatts](https://www.anthropic.com/news/google-broadcom-partnership-compute) of next-generation TPUs starting in 2027.
- [OpenAI](https://www.networkworld.com/article/4015386/openai-tests-google-tpus-amid-rising-inference-cost-concerns.html) — began testing Google's TPUs in 2025, and [plans to buy them](https://www.techtarget.com/news/openais-reported-google-tpu-deal-tests-ai-chip-economics/873139/), The Information reported in October 2026. Inference consumes over 50% of OpenAI's compute budget, and TPUs, specifically older ones, offer **significantly lower cost-per-inference** than NVIDIA GPUs, Forrester's Charlie Dai told Network World.
- [Apple](https://arxiv.org/abs/2407.21075) — trained Apple Foundation Models on **8,192 TPUv4 chips with 52% sustained MFU**.
- [Meta](https://siliconangle.com/2026/02/26/google-meta-reportedly-strike-new-multibillion-dollar-ai-chip-deal/) — **multi-billion-dollar TPU lease in February 2026** to train and run its next-generation models.
- [Recursion Pharmaceuticals](https://cloud.google.com/customers/recursion) — drug discovery on TPU at scale.

For the protein models in this demo, TPUs are a second silicon path beside GPUs.

</details>

<details><summary>(i) panel: Why TPU Economics Are Structural</summary>
<!-- slide: `tpu2` -->

TPU TCO per hour can be **up to 30% lower than NVIDIA GB200 and 41% lower than GB300**, per [SemiAnalysis](https://newsletter.semianalysis.com/p/tpuv7-google-takes-a-swing-at-the).

SemiAnalysis's [AgentX](https://newsletter.semianalysis.com/p/tpu-strikes-the-king) benchmark measures agentic inference per dollar:

- **GLM-5.2 at FP8:** TPUv7 is the cheapest FP8 option, with **1.2× to 2.7× the tokens per dollar** of B200, B300, and MI355X from 60 to 300 tok/s/user.
- **Qwen3.5 397B:** TPUv7 at FP8 is **1.67× better perf per dollar** than even FP4 GB300 NVL72.
- **Kimi K3 with MXFP4 weights:** TPUv7 delivers **1.15× to 2.5× the tokens per dollar** of GB200, B200, B300, and MI355X.

On single-turn [InferenceX](https://newsletter.semianalysis.com/p/tpu-inferencex-full-steam) runs, TPUv7 Ironwood delivered **up to 50% better performance per dollar** than B200 and B300, FP8 against FP8 on Qwen3.5 397B.

At Spot pricing, [Escalante](https://cloud.google.com/blog/topics/customers/escalante-uses-jax-on-tpus-for-ai-driven-protein-design) got **3.65× the performance per dollar** from Cloud TPU v6e over an H100 for its large-scale protein design jobs.

The lanes in this demo price each fold at one accelerator's on-demand rate.

Power matters too. A TPU v7 rack draws **70 kW versus 120 kW for an NVIDIA GB200 NVL72 rack** — 42% less power per rack.

</details>

<details><summary>(i) panel: One PyTorch File, Both Chips</summary>
<!-- slide: `tpu3` -->

Researchers are familiar with PyTorch. [TorchTPU](https://developers.googleblog.com/torchtpu-running-pytorch-natively-on-tpus-at-google-scale/) runs it natively on TPU, with ordinary PyTorch tensors and no wrappers. In Google's testing, **69% of 4,300+ Hugging Face models ran with zero code changes**. It's been [public](https://github.com/google-pytorch/torch_tpu) since October 19: `pip install torch-tpu`.

{examples:tpu3}

```python
def device_for(name):
    if name == "tpu":           # NEW
        import torch_tpu        # NEW
    return torch.device(name)   # "tpu" or "cuda"
```

</details>

<details><summary>(i) panel: AI Models Only Google Has</summary>
<!-- slide: `models1` -->

ESMFold predicted the structure on the right on a Cloud TPU during this talk. In the [Nature Index 2026 corporate research rankings](https://www.nature.com/nature-index/research-leaders/2026/institution/corporate/all/global), **Alphabet ranks #5 globally and first among cloud providers**. **Microsoft ranks #26. Amazon ranks #55.**

**Science model catalog:**

- [**AlphaFold**](https://deepmind.google/science/alphafold/) — Nobel Prize in Chemistry 2024 (John Jumper). [Used by 3 million researchers across 190+ countries as of Q1 2026](https://deepmind.google/blog/alphafold-five-years-of-impact/).
- [**AlphaGenome**](https://deepmind.google/science/alphagenome/) — predicts 5,930 human genome tracks across diverse cell types and 11 output modalities. Cracks the 98% of non-coding DNA that no prior model could meaningfully interpret.
- [**AI Co-Scientist**](https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/) — proposed the same antimicrobial-resistance hypothesis Prof. José Penadés' Imperial College lab had reached through a decade of bench work — in hours, not years, which Stanford's Gary Peltz, who used it to identify the cancer drug Vorinostat as a liver-fibrosis candidate, [called *"consulting the oracle of Delphi"*](https://www.technologyreview.com/2026/05/22/1137813/google-i-o-showed-how-the-path-for-ai-science-is-shifting/) ([*Cell*, Sep 2025](https://www.cell.com/cell/fulltext/S0092-8674(25)00973-0); [*Advanced Science*, Sep 2025](https://advanced.onlinelibrary.wiley.com/doi/10.1002/advs.202508751)).
- [**ERA (Empirical Research Assistance)**](https://blog.google/innovation-and-ai/technology/research/gemini-for-science-io-2026/) — beat the CDC's own COVID-19 hospitalization forecasting ensemble in head-to-head benchmarks ([*Nature*, May 2026](https://www.nature.com/articles/s41586-026-10658-6)).
- [**AlphaEvolve**](https://deepmind.google/blog/alphaevolve-a-gemini-powered-coding-agent-for-designing-advanced-algorithms/) — agentic research engine that generates and scores thousands of algorithm variations in parallel. Manufacturing companies are using it in production to accelerate supply-chain decisions across global networks.
- [**WeatherNext**](https://deepmind.google/science/weathernext/) — highlighted in I/O keynote as providing advance landfall warning for Hurricane Melissa to Jamaica that likely saved lives.
- [**MedGemma**](https://developers.google.com/health-ai-developer-foundations/medgemma/model-card) (3D CT and MRI from version 1.5) and [**MedSigLIP**](https://developers.google.com/health-ai-developer-foundations/medsiglip/model-card) — open medical models for imaging work.
- [**DeepVariant**](https://github.com/google/deepvariant), [**TxGemma-9B**](https://developers.google.com/health-ai-developer-foundations/txgemma/model-card), [**AlphaEarth Foundations**](https://deepmind.google/blog/alphaearth-foundations-helps-map-our-planet-in-unprecedented-detail/), and many more — variant calling, therapeutic LLM, environmental sensing.

</details>
