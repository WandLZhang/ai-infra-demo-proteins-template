// A fork edits this file and theme.config.ts, and nothing else. The default identity is Cornell.
//
// The slide text lives in talk_track.md. Its {placeholders} read this file when a slide shows:
//   {institution}            institution.shortName
//   {loginNode}              home.loginNode
//   {bucket}                 home.displayBucket
//   {controllerConsoleHref}  home.controllerConsoleHref
//   {intro}                  content.intro
//   {catalog:pd|db|md}       content.catalog
//   {examples:<slide>}       content.examples
export const config = {
  institution: {
    shortName: 'Cornell',
    fullName: 'Cornell University',
    pageTitle: 'Cornell HPC with Google',
    menuSubtitle: 'Cornell Research Computing · TPU vs GPU',
  },
  home: {
    buildingName: 'RHODES HALL',
    markerLatLng: { lat: 42.4434, lng: -76.4817 },
    cameraLatLng: { lat: 42.4186, lng: -76.3857 },
    // Map zoom on the home slide: 12 frames a city, 15 frames one campus.
    zoom: 12,
    // Text on the home marker. Empty shows shortName in capitals.
    markerLabel: '',
    loginNode: 'cbsulogin',
    markerSubtitle: 'cbsulogin · BioHPC',
    controllerConsoleHref: 'https://console.cloud.google.com/compute/instancesDetail/zones/us-east5-a/instances/biowulf-controller?project=wz-nih-demo-controller',
    displayBucket: 'gs://cornell-research',
  },
  // More markers on the home slide, such as a consortium's member campuses.
  memberSites: [] as { label: string; subtitle: string; lat: number; lng: number }[],
  // The slide text that names this institution's systems, labs and people. Markdown: **bold**,
  // *italic*, `code` and [links](https://...). The placeholders above work here too.
  content: {
    // The home slide's first paragraph. Name the clusters and the Slurm login node researchers use.
    intro: 'Your institution is evaluating how to extend on-prem HPC into the cloud. Research compute today may be spread across multiple independent estates — departmental clusters, shared institutional HPC, and consortium allocations. The next phase is extending that foundation elastically into the cloud.',
    // Who runs each workload shape here, after the shape's name on the catalog slide. Empty shows the name only.
    catalog: {
      pd: '',  // Independent GPU Jobs
      db: '',  // Data-Anchored Burst
      md: '',  // Tightly-Coupled Simulation
    },
    // One bullet per researcher or workload on that slide. A slide with no entry shows none. Name a
    // researcher only with a public source, for example:
    //   '**Name** (Department) — [the model or code](https://...), and why it fits this slide.'
    examples: {
      pd1: [
        '**Protein structure prediction** — AlphaFold2, ZDOCK, molecular docking. Per-interaction deep learning that fans out cleanly onto single-GPU nodes.',
        '**Single-cell and epigenomic pipelines** — Hi-C, ChIP-seq, CUT&RUN, ATAC-seq. Each sample is its own batch job.',
        '**ML model training** — hyperparameter sweeps, fine-tuning, reinforcement learning. Embarrassingly parallel across GPU nodes.',
        '**Medical imaging AI** — pathology slides, radiology, MRI. PyTorch models that ran on shared consortium GPUs can land on GCP in minutes instead of waiting in queue.',
      ],
      pd2: [],
      img: [
        '**NLP and topic modeling** — digital-humanities text corpora, document classification. L4-class fractional inference.',
        '**Point-of-care diagnostics** — mobile health platforms, colorimetric assays. Scale-to-zero L4 endpoints on Cloud Run.',
        '**Real-time microscopy** — high-frame-rate acquisition with GPU-accelerated reconstruction, served as a managed endpoint on Cloud Run.',
      ],
      catalog2: [
        '**Synchrotron beamline data** — SAXS, crystallography. Each beamtime produces a write-heavy burst of detector images followed by read-intensive reduction. Synchrotrons run over a thousand scientists/year, generating hundreds of TB per run where detector brightness is outrunning on-prem compute.',
        '**Cryo-EM movie datasets** — CryoSPARC, RELION, ChimeraX, Phenix. Multi-terabyte data written once, then read repeatedly through motion-correction and 3D classification.',
        '**Genomic sequencing archives** — decades of immutable sequencing data reprocessed in batch through alignment and peak-calling pipelines.',
        '**Quantum-matter or high-energy-physics imaging** — terabyte-scale datasets with the same write-once, read-many profile.',
      ],
      md1: [
        '**Molecular dynamics** — replica-exchange MD, free-energy perturbation, long-duration trajectories of signaling proteins. Many tightly-coupled ranks exchanging state, the canonical communication-bound HPC pattern.',
        '**Finite-element multiphysics** — COMSOL, structural mechanics, soft-matter modeling. Coupled-physics solvers that span multiple nodes.',
        '**Computational fluid dynamics** — both classical MPI solvers and ML-native differentiable CFD in [JAX](https://jax.readthedocs.io/), Google\'s own framework, embedding PDE operators directly into neural nets.',
      ],
      tpu3: [
        '**RLHF training pipelines** — DeepSpeed, vLLM, FlashAttention-2, HuggingFace Accelerate on Llama-class models. This is the PyTorch stack TorchTPU targets.',
        '**Gaussian process and Bayesian ML** — libraries like GPyTorch are PyTorch-native research that runs on TPU without rewriting in JAX.',
      ],
    } as Record<string, string[]>,
  },
  deploy: {
    firebaseSite: 'cornell-protein-demo',
  },
}
