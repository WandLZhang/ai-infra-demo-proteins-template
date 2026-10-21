# Demo Talk Track — GPS Summit Cut (Stanford / SLAC)

> Condensed main-stage version, deployed to **hpc-protein-summit-demo.web.app**. Each slide's
> info box is trimmed to 1–2 sentences for a peppy 5–10 min recording. Institution identity
> (Stanford University / SLAC National Accelerator Laboratory, `sh-login · Sherlock`) comes
> from `src/config/institution.config.ts`.
>
> Press **Enter** to advance:
> `home → dispatching → catalog → pd1 → img → catalog2 → catalog4 → md1 → tpu1 → tpu3 → models1`

---

## 1. HPC Cloud Burst  *(slide: `home`)*

As you can imagine, Google has its own custom silicon, network, and datacenters — attributes which make bursting HPC to Google worth a closer look, as Gartner already did. Here is their latest report. (Click open https://www.gartner.com/doc/reprints?id=1-2NMT0142&ct=260630&st=sb)

On the screen is a simulated on-prem Slurm cluster that will burst out into the cloud when I press Enter. Here is the actual VM (click VM). This will launch six protein-folding jobs across TPU and GPU, to whichever region has capacity.

---

## 2. Multi-Region Burst  *(slide: `dispatching` / `running`)*

Now researchers keep their same identity using [Managed AD](https://cloud.google.com/managed-microsoft-ad/docs/overview) to bridge their on-prem login into the cloud. And capacity takes care of itself: if a zone can't grab a node, Slurm waits and retries in the next region — you'll see the jobs move across west, central and east regions on their own. (Click VM) Here you see these VMs are in a different environment than the one on prem but it's still technically the same slurm cluster. 

---

## 3. Research Applications Catalog  *(slide: `catalog`)*

(Open info box)

Every research institution runs hundreds of software titles. Here we sort them into three shapes — **independent GPU jobs, data-anchored bursting, and tightly-coupled simulation** — ordered from quickest win to deepest level of HPC.

---

## 4. Independent GPU Jobs  *(slide: `pd1`)*

This current demo shows the easy independent GPU genre of jobs. AlphaFold, ESMFold, and Boltz-2 each run on a single GPU and TPU and fan out in parallel. Only on Google can our [Hyperdisk ML](https://docs.cloud.google.com/kubernetes-engine/docs/how-to/persistent-volumes/hyperdisk-ml) storage serve the weights up to 2,500 nodes, GPUs start in 2 minutes not 15, and a single [GKE](https://cloud.google.com/blog/products/containers-kubernetes/whats-new-in-gke-at-next26) control plane run one million chips.

---

## 5. Independent GPU Jobs: Fractional & Serverless  *(slide: `img`)*

Inference is a huge topic now, and not every researcher needs a full H100. Only on Google can you split up the [RTX PRO 6000 GPUs](https://docs.cloud.google.com/compute/docs/accelerator-optimized-machines#g4-series) so one researcher gets 4 chips while another gets 2 — and a job can even run serverless, with a GPU, on [Cloud Run](https://cloud.google.com/run/docs/configuring/services/gpu). AWS Lambda and App Runner still have no GPU at all.

(close box)

---

## 6. Data-Anchored Burst: Storage  *(slide: `catalog2`)*

Now the next workload shape at medium difficulty is where you have huge datasets, but they're static, like cryo-EM. Only Google has [multi-region buckets](https://cloud.google.com/storage/docs/cloud-storage-fuse/overview), so nodes across different regions can share one namespace in the same bucket — so no copies to manage.

---

## 7. Data-Anchored Burst: vs AWS & Azure  *(slide: `catalog4`)*

(open box)

S3 and Azure Blobs have no multi-region buckets — and no [Rapid Cache](https://docs.cloud.google.com/storage/docs/rapid/rapid-cache), no [Rapid Bucket](https://docs.cloud.google.com/storage/docs/rapid/rapid-bucket), which are extremely fast ways to save checkpoints and serve weights. Our storage is uniquely suited in the market for AI infrastructure workloads.

---

## 8. Tightly-Coupled Simulation  *(slide: `md1`)*

Finally, the deepest workload is tightly-coupled MPI — molecular dynamics, fluid dynamics. Our [Managed Lustre](https://docs.cloud.google.com/managed-lustre/docs/overview) is far and away the fastest — 5x to 20× faster than our competitors. And Google can manage these jobs by [placing ranks on the same rack](https://docs.cloud.google.com/cluster-director/docs/orchestration), [predicting when a node will fail 5 hours early](https://docs.cloud.google.com/ai-hypercomputer/docs/workloads/enable-node-health-prediction), and using [optical circuit switching](https://cloud.google.com/blog/products/networking/introducing-virgo-megascale-data-center-fabric) to reroute around a dead chip mid-run without restarting.

---

## 9. TPUs  *(slide: `tpu1`)*

Moving past GPUs, about 90% of [gen-AI unicorns run on Google](https://cloud.google.com/ai-infrastructure) — and a major reason is the TPU differentiator. [Anthropic](https://www.anthropic.com/news/expanding-our-use-of-google-cloud-tpus-and-services) runs Claude on up to a million chips, and OpenAI serves ChatGPT inference on TPU. The economics are structural: TPUs run 30 to 40% cheaper than the top NVIDIA chips ([SemiAnalysis](https://newsletter.semianalysis.com/p/tpuv7-google-takes-a-swing-at-the)), at higher utilization, on 42% less power per rack.

(point out our outputs)

---

## 10. TorchTPU: ESMFold in 4 Lines  *(slide: `tpu3`)*

And researchers don't have to change their stack — [TorchTPU](https://developers.googleblog.com/torchtpu-running-pytorch-natively-on-tpus-at-google-scale/) runs PyTorch natively on TPU. The diff between our GPU and TPU backends for ESMFold is just **four lines of code**.

---

## 11. AI Models Only Google Has  *(slide: `models1`)*

(Point out inference output)

The proof of Google's infrastructure effectiveness is our frontier research. Alphabet is **#3 in the world** for research output, ahead of every other tech company: **AlphaFold, the 2024 Nobel Prize in Chemistry, used by 3 million researchers** — plus AlphaGenome, AlphaEvolve, Co-Scientist and many more. /Google invented the mediums the whole industry runs on — **the Transformer, TensorFlow, Kubernetes, and JAX**. Through Public Sector fixed-price subscriptions [**PSSA**](https://cloud.google.com/edu/researchers) and incentives in our **GPAR** program, you all can have **both halves of the stack, the infrastructure and the science, from one place**.
