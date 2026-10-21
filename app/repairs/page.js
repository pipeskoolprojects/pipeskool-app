"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Logo from "@/components/Logo";
import { getSession, can } from "@/lib/auth";
import { fileStore, fileHref } from "@/lib/files";
import { clearRepairDraft, readRepairDraft, writeRepairDraft } from "@/lib/repair-draft";
import { createRepairRequest, getRepairDetail, listRepairRequests, listRepairVendors, makeRepairPdf, receiveRepairMachine, sendRepairRequest, saveRepairReceiptVersion, repairPages } from "@/lib/machine-repair";
import { incompleteRepairMachines, repairTabMatches } from "@/lib/machine-repair-core.mjs";
import styles from "./machine-repair.module.css";

const statusTone = s => s==="Received"?"done":s==="Requested"?"requested":s==="Partially received"?"partial":"vendor";
const machineStatus = (r,m) => !r.sent_at ? "Awaiting dispatch" : m.received_at ? "Received" : "With vendor";
const displayDate = d => d ? new Date(d).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const readDataUrl = async data => { const r=await fetch(data); return new File([await r.blob()],"repair-photo.jpg",{type:"image/jpeg"}); };
async function compressPhoto(file) {
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,1000/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Photo could not be compressed.")),"image/jpeg",.75));
  return new File([blob],"repair-photo.jpg",{type:"image/jpeg"});
}
function filePreview(file) { return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file);}); }
function vendorShareUrl(vendor, url) {
  if (!url) return "";
  const phone=String(vendor?.contact_mobile||vendor?.phone||"").replace(/\D/g,"");
  const text=encodeURIComponent("Repair challan from Pipeskool: "+url);
  if (phone) return "https://wa.me/"+(phone.length===10?"91"+phone:phone)+"?text="+text;
  if (vendor?.email) return "mailto:"+encodeURIComponent(vendor.email)+"?subject="+encodeURIComponent("Pipeskool repair challan")+"&body="+text;
  return "";
}
function shareContact(vendor, url) {
  const target=vendorShareUrl(vendor,url);
  if(target)window.open(target,"_blank","noopener,noreferrer");
}
function A4Receipt({ request, vendor, rootRef }) {
  const pages=repairPages(request.machines);
  return <div ref={rootRef} className={"repair-print-root "+styles.receiptRoot}>
    {pages.map((group,pageIndex)=><section key={pageIndex} className={"repairReceiptPage "+styles.receiptPage}>
      <header className={styles.receiptHeader}><Logo height={24}/><div><strong>REPAIR CHALLAN</strong><span>{request.number.replace(/^REP-/,"RPC-")} · {displayDate(request.sent_at||request.created_at)}</span></div></header>
      <div className={styles.orangeRule}/>
      <div className={styles.addresses}>
        <div><b>From</b><span>Pipeskool Projects Pvt. Ltd.</span><span>{request.site_name}</span><small>Sent by: {request.sent_by_name||request.raised_by_name}</small></div>
        <div><b>To (Repair vendor)</b><span>{vendor?.name||request.vendor_name||"—"}</span><small>{vendor?.contact_person||""}</small><small>{vendor?.contact_mobile||vendor?.phone||""}</small></div>
      </div>
      <p className={styles.receiptNote}>The following {request.machines.length} machine{request.machines.length===1?"":"s"} are sent for repair. Please repair and return.</p>
      <div className={styles.machineGrid}>{group.map(m=><article key={m.id} className={styles.receiptMachine}>
        <img src={fileHref(m.photo_url)} alt={m.name}/>
        <b>{m.sequence_no}. {m.name}</b><span><strong>Problem:</strong> {m.problem}</span>
      </article>)}{Array.from({length:4-group.length},(_,i)=><div key={"blank"+i}/>)}</div>
      <footer className={styles.receiptFooter}><div><span>Sent by (Pipeskool)</span><i/></div><div><span>Received by (Vendor)</span><i/></div><small>Page {pageIndex+1} of {pages.length}</small></footer>
    </section>)}
  </div>;
}
export default function MachineRepairPage() {
  const [query,setQuery]=useState("");
  const [sess,setSess]=useState(null),[rows,setRows]=useState([]),[vendors,setVendors]=useState([]),[detail,setDetail]=useState(null);
  const [loading,setLoading]=useState(true),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [tab,setTab]=useState("All"),[selected,setSelected]=useState(null),[creating,setCreating]=useState(false),[showReceipt,setShowReceipt]=useState(false);
  const [machines,setMachines]=useState([{name:"",problem:"",photo:null,preview:""}]),[invalid,setInvalid]=useState([]),[uploading,setUploading]=useState(false),[uploadStep,setUploadStep]=useState("");
  const [vendorId,setVendorId]=useState(""),[confirmMachine,setConfirmMachine]=useState(null),[remark,setRemark]=useState(""),[busy,setBusy]=useState(false);
  const [draftReady,setDraftReady]=useState(false),[regenerating,setRegenerating]=useState(false),[draftKey,setDraftKey]=useState("");
  useEffect(()=>{setQuery(window.location.search);},[]);
  const receiptRef=useRef(null);
  const siteId=sess?.currentSite||sess?.sites?.[0]?.id;
  const supervisor=["supervisor","site_engineer"].includes(sess?.role);
  const office=["director","ho_admin","it_executive"].includes(sess?.role)||can(sess,"machine_repair","approve",siteId)||can(sess,"machine_repair","manage",siteId);
  const canCreate=supervisor&&(can(sess,"machine_repair","create",siteId)||can(sess,"machine_repair","manage",siteId));
  const canRead=office||(sess?.sites||[]).some(s=>["view","create","manage"].some(a=>can(sess,"machine_repair",a,s.id)));
  const load=useCallback(async(keepSelection=true)=>{
    setLoading(true);setError("");
    try {
      const [list,v]=await Promise.all([listRepairRequests(),listRepairVendors()]);
      const matched=list.filter(r=>office|| (sess?.sites||[]).some(s=>String(s.id)===String(r.site_id)));
      setRows(matched);setVendors(v);
      const id=selected||(new URLSearchParams(query).get("id")||new URLSearchParams(query).get("repair"));
      if(keepSelection&&id) {
        const found=list.find(r=>String(r.id)===String(id));
        setSelected(found?.id||null);setDetail(found?await getRepairDetail(found.id):null);
      } else if(matched.length&&!window.matchMedia("(max-width: 999px)").matches) {
        setSelected(matched[0].id);setDetail(await getRepairDetail(matched[0].id));
      } else if(!matched.length) {setSelected(null);setDetail(null);}
    } catch(e) {setError(e?.message||"Repair requests could not load.");}
    finally {setLoading(false);}
  },[office,query,selected,sess,tab]);
  useEffect(()=>{const s=getSession();setSess(s);if(!s){setError("Sign in to open Machine Repair.");setLoading(false);return;}},[]);
  useEffect(()=>{if(sess)load();},[sess,tab,load]);
  useEffect(()=>{if(new URLSearchParams(query).get("new")==="1"&&canCreate){setCreating(true);setSelected(null);setDetail(null);}},[query,canCreate]);
  useEffect(()=>{
    if(!sess||!creating)return;
    const key=`${sess.id}:${siteId}`;let alive=true;
    readRepairDraft(key).then(d=>{if(!alive)return;if(d){setMachines(d.machines?.length?d.machines.map(m=>({...m,photo:null})):machines);setDraftKey(d.submissionKey||"");}setDraftReady(true);});
    return()=>{alive=false;};
  },[sess?.id,siteId,creating]);
  useEffect(()=>{
    if(!sess||!creating||!draftReady)return;
    const key=`${sess.id}:${siteId}`;
    const timer=setTimeout(()=>writeRepairDraft(key,{submissionKey:draftKey,machines:machines.map(({name,problem,preview})=>({name,problem,preview}))}),300);
    return()=>clearTimeout(timer);
  },[sess,siteId,creating,draftReady,draftKey,machines]);
  const filtered=rows.filter(r=>repairTabMatches(tab,r.status));
  const counts=useMemo(()=>Object.fromEntries(["All","Requested","With vendor","Received"].map(t=>[t,t==="All"?rows.length:rows.filter(r=>repairTabMatches(t,r.status)).length])),[rows]);
  const selectRequest=async r=>{setCreating(false);setShowReceipt(false);setSelected(r.id);setError("");try{setDetail(await getRepairDetail(r.id));}catch(e){setError(e.message||"Could not open request.");}};
  const setMachine=(i,key,value)=>setMachines(old=>old.map((m,n)=>n===i?{...m,[key]:value}:m));
  const choosePhoto=async(e,i)=>{
    const f=e.target.files?.[0];e.target.value="";if(!f)return;
    try{const photo=await compressPhoto(f);setMachine(i,"photo",photo);setMachine(i,"preview",await filePreview(photo));setInvalid([]);}catch(err){setError(err.message||"Could not read this photo.");}
  };
  const addMachine=()=>{if(machines.length>=20)return;setMachines(m=>[...m,{name:"",problem:"",photo:null,preview:""}]);setDraftReady(true);};
  const submit=async()=>{
    const bad=incompleteRepairMachines(machines);setInvalid(bad);if(bad.length){setError("Complete all required fields for machine "+bad.map(x=>x.number).join(", ")+".");return;}
    if(busy)return;setBusy(true);setUploading(true);setError("");
    try{
      const submitted=[];
      for(let i=0;i<machines.length;i++){
        setUploadStep(`Uploading photo ${i+1} of ${machines.length}…`);
        const photo=machines[i].photo||await readDataUrl(machines[i].preview);
        const path=`repairs/site-${siteId}-${Date.now()}-${i+1}.jpg`;
        const {error:e}=await fileStore.from("attendance-photos").upload(path,photo,{contentType:"image/jpeg",upsert:false});
        if(e)throw new Error((!navigator.onLine?"Offline: ":"")+"Photo "+(i+1)+" could not upload. Your saved draft is still here. Retry to continue.");
        submitted.push({name:machines[i].name.trim(),problem:machines[i].problem.trim(),photo_url:path});
      }
      const requestKey=draftKey||crypto.randomUUID();
      setDraftKey(requestKey);
      await writeRepairDraft(`${sess.id}:${siteId}`,{submissionKey:requestKey,machines:machines.map(({name,problem,preview})=>({name,problem,preview}))});
      const res=await createRepairRequest(siteId,submitted,requestKey);
      await clearRepairDraft(`${sess.id}:${siteId}`);
      setMachines([{name:"",problem:"",photo:null,preview:""}]);setDraftKey("");setCreating(false);setDraftReady(false);setNotice("Repair request "+res.number+" submitted.");setSelected(res.id);await load(false);setDetail(await getRepairDetail(res.id));
    }catch(e){setError(e?.message||"Request could not be submitted. Your draft is saved.");}
    finally{setUploading(false);setUploadStep("");setBusy(false);}
  };
  const saveReceived=async()=>{
    if(!confirmMachine||busy)return;setBusy(true);setError("");
    try{await receiveRepairMachine(confirmMachine.id,remark);setConfirmMachine(null);setRemark("");setNotice("Machine marked received.");await load(true);}
    catch(e){setError(e?.message||"Could not mark machine received.");}
    finally{setBusy(false);}
  };
  const printReceipt=()=>{
    const clearPrintMode=()=>document.body.classList.remove("repair-print-mode");
    document.body.classList.add("repair-print-mode");
    window.addEventListener("afterprint",clearPrintMode,{once:true});
    window.print();
  };
  const sendReceipt=async()=>{
    if(!detail||!vendorId||busy)return;
    setBusy(true);setError("");
    let shareWindow=null;
    try{
      shareWindow=window.open("about:blank","_blank");
      const blob=await makeRepairPdf(receiptRef.current,detail);
      const sent=await sendRepairRequest(detail.id,vendorId,blob);
      setNotice("Machines sent to vendor. Receipt PDF saved.");
      const vendor=vendors.find(v=>String(v.id)===String(vendorId));
      const shareUrl=vendorShareUrl(vendor,sent.pdf_url);
      if(shareWindow){if(shareUrl){shareWindow.opener=null;shareWindow.location.href=shareUrl;}else shareWindow.close();}
      await load(true);setShowReceipt(true);
    }catch(e){
      if(shareWindow)shareWindow.close();
      setError(e?.message||"Could not generate or send the receipt.");
    }finally{setBusy(false);}
  };
  const downloadPdf=async()=>{
    if(!detail)return;try{const blob=await makeRepairPdf(receiptRef.current,detail);const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=detail.number.replace(/^REP-/,"RPC-")+"-repair-receipt.pdf";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}catch(e){setError(e.message||"PDF could not be generated.");}
  };
  if(!sess)return <main className={styles.page}><p>{error||"Loading…"}</p></main>;
  if(!canRead&&!canCreate)return <main className={styles.page}><h1>Machine Repair</h1><p>You do not have permission to view Machine Repair for this site.</p></main>;
  return <main className={styles.page}>
    <header className={styles.heading}><div><h1>Machine Repair</h1><p>Track faulty tools from site to vendor and back.</p></div>{canCreate&&!creating&&!showReceipt&&<button className={styles.primary} onClick={()=>{setMachines([{name:"",problem:"",photo:null,preview:""}]);setDraftKey("");setDraftReady(false);setCreating(true);setDetail(null);setSelected(null);setError("");}}>＋ New Repair</button>}</header>
    {notice&&<div className={styles.notice} role="status">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
    {error&&<div className={styles.error} role="alert">{error}<button onClick={()=>load(true)} disabled={loading}>Retry</button></div>}
    {creating? <section className={styles.formCard}>
      <div className={styles.sectionHeading}><div><h2>New repair request</h2><p>Site: {sess.sites?.find(s=>String(s.id)===String(siteId))?.name||"Assigned site"} · Raised by: {sess.name}</p></div><button className={styles.secondary} onClick={()=>setCreating(false)}>Cancel</button></div>
      {machines.map((m,i)=>{const bad=invalid.find(x=>x.number===i+1)?.missing||[];return <article key={i} className={styles.machineEditor}>
        <div className={styles.machineEditorHead}><strong>Machine {i+1}</strong>{machines.length>1&&<button className={styles.textButton} onClick={()=>setMachines(ms=>ms.filter((_,n)=>n!==i))}>Remove</button>}</div>
        <div className={styles.editorGrid}><div>
          <label className={styles.photoBox+(bad.includes("photo")? " "+styles.fieldError:"")}>
            {m.preview?<img src={m.preview} alt={m.name||"Machine photo"}/>:<span>📷<small>Add machine photo</small></span>}
            <input type="file" accept="image/*" capture="environment" onChange={e=>choosePhoto(e,i)}/>
          </label><div className={styles.photoActions}><label>Camera<input type="file" accept="image/*" capture="environment" onChange={e=>choosePhoto(e,i)}/></label><label>Gallery<input type="file" accept="image/*" onChange={e=>choosePhoto(e,i)}/></label></div>{bad.includes("photo")&&<small className={styles.red}>Add a photo</small>}
        </div><div className={styles.fields}>
          <label>Machine name<input className={bad.includes("name")?styles.invalidInput:""} value={m.name} onChange={e=>setMachine(i,"name",e.target.value)} placeholder="e.g. Welding machine"/></label>{bad.includes("name")&&<small className={styles.red}>Enter the machine name</small>}
          <label>Problem / repair needed<textarea className={bad.includes("problem")?styles.invalidInput:""} value={m.problem} onChange={e=>setMachine(i,"problem",e.target.value)} placeholder="Describe what is broken" rows={3}/></label>{bad.includes("problem")&&<small className={styles.red}>Describe the problem</small>}
        </div></div>
      </article>})}
      <div className={styles.formFooter}><button className={styles.secondary} onClick={addMachine} disabled={machines.length>=20}>＋ Add another machine</button><span>{machines.length} machine{machines.length===1?"":"s"} added · max 20</span></div>
      {uploading&&<p className={styles.muted}>{uploadStep} Keep this page open. Your text and photos are saved as a local draft.</p>}
      <button className={styles.primary+" "+styles.doneButton} onClick={submit} disabled={busy}>{busy?"Saving request…":"Done"}</button>
    </section> : showReceipt&&detail ? <section className={styles.receiptScreen}>
      <div className={styles.sectionHeading}><div><h2>Repair Receipt</h2><p>{detail.number} · {repairPages(detail.machines).length} A4 page{repairPages(detail.machines).length===1?"":"s"}</p></div><button className={styles.secondary} onClick={()=>setShowReceipt(false)}>Back to request</button></div>
      <div className={styles.receiptActions}><button className={styles.primary} onClick={printReceipt}>Print / PDF</button><button className={styles.secondary} onClick={downloadPdf}>Download PDF</button>{!detail.sent_at&&<button className={styles.primary} onClick={sendReceipt} disabled={!vendorId||busy}>{busy?"Sending…":"Generate Receipt & Send to Vendor"}</button>}{detail.sent_at&&<button className={styles.secondary} onClick={()=>shareContact(vendors.find(v=>String(v.id)===String(detail.vendor_id)),detail.receipts?.[0]?.pdf_url)}>Send to Vendor (WhatsApp / email)</button>}{detail.sent_at&&office&&<button className={styles.secondary} disabled={regenerating} onClick={async()=>{setRegenerating(true);try{const blob=await makeRepairPdf(receiptRef.current,detail);const v=await saveRepairReceiptVersion(detail.id,blob);setNotice("New receipt version "+v.version+" saved.");await load(true);}catch(e){setError(e.message||"Receipt version could not be saved.");}finally{setRegenerating(false);}}}>{regenerating?"Saving…":"Regenerate PDF version"}</button>}</div>
      {detail.sent_at&&detail.receipts?.length>0&&<div className={styles.history}><strong>Receipt versions</strong>{detail.receipts.map(r=><a key={r.id} href={r.pdf_url||fileHref(r.pdf_path)} target="_blank" rel="noreferrer">Version {r.version} · {displayDate(r.generated_at)} · Open PDF</a>)}</div>}
      <A4Receipt request={detail} vendor={vendors.find(v=>String(v.id)===String(vendorId))} rootRef={receiptRef}/>
    </section> : <div className={styles.workspace+(selected&&!creating? " "+styles.showDetail:"")}>
      <section className={styles.listPanel}>
        <div className={styles.tabs}>{["All","Requested","With vendor","Received"].map(t=><button key={t} className={tab===t?styles.activeTab:""} onClick={()=>setTab(t)}>{t}<b>{counts[t]||0}</b></button>)}</div>
        {loading?<div className={styles.skeletons}>{[1,2,3].map(x=><div key={x} className={styles.skeleton}/>)}</div>:filtered.length===0?<div className={styles.empty}><span>🛠</span><strong>No repair requests</strong><p>New repair requests will appear here.</p></div>:filtered.map(r=><button key={r.id} className={styles.requestRow+(String(selected)===String(r.id)? " "+styles.selectedRow:"")} onClick={()=>selectRequest(r)}>
          <div className={styles.rowTop}><strong>{r.number}</strong><span className={styles["status_"+statusTone(r.status)]}>{r.status}</span></div>
          <p>{displayDate(r.created_at)} · {r.machine_count} machine{r.machine_count===1?"":"s"}{r.sent_at? ` · ${r.received_count}/${r.machine_count} received`:""}</p>
          {office&&<small>Raised by {r.raised_by_name} · {r.site_name}</small>}
          <div className={styles.thumbStrip}>{r.machines.slice(0,5).map(m=><img key={m.id} src={fileHref(m.photo_url)} alt=""/>)}</div>
        </button>)}
      </section>
      <section className={styles.detailPanel}>
        {!detail?<div className={styles.empty}><span>↖</span><strong>Select a repair request</strong><p>Request details will appear here.</p></div>:<>
          <div className={styles.detailHead}><button className={styles.mobileBack} onClick={()=>{setSelected(null);setDetail(null);}}>← Requests</button><div><h2>{detail.number}</h2><span className={styles["status_"+statusTone(detail.status)]}>{detail.status}</span></div>{detail.sent_at&&<button className={styles.secondary} onClick={()=>setShowReceipt(true)}>View Repair Receipt ({repairPages(detail.machines).length} pages)</button>}</div>
          <div className={styles.infoGrid}><div><small>Raised by</small><b>{detail.raised_by_name}</b></div><div><small>Site</small><b>{detail.site_name}</b></div><div><small>Date</small><b>{displayDate(detail.created_at)}</b></div><div><small>Vendor</small><b>{detail.vendor_name||"Not assigned yet"}</b></div></div>
          {!detail.sent_at&&office&&<div className={styles.sendBox}><label>Repair vendor<select value={vendorId} onChange={e=>setVendorId(e.target.value)}><option value="">Select vendor</option>{vendors.map(v=><option value={v.id} key={v.id}>{v.name}</option>)}</select></label><button className={styles.primary} disabled={!vendorId} onClick={()=>setShowReceipt(true)}>Preview repair receipt</button></div>}
          <div className={styles.machineList}>{detail.machines.map(m=><article key={m.id} className={styles.machineDetail}>
            <button className={styles.zoomPhoto} onClick={()=>window.open(fileHref(m.photo_url),"_blank","noopener,noreferrer")}><img src={fileHref(m.photo_url)} alt={m.name}/></button>
            <div className={styles.machineInfo}><div className={styles.rowTop}><h3>{m.sequence_no}. {m.name}</h3><span className={styles.machineChip}>{machineStatus(detail,m)}</span></div><p>{m.problem}</p>
              {m.received_at&&<small>Received {displayDate(m.received_at)} by {m.receiver?.full_name||"site supervisor"}{m.remark?" · "+m.remark:""}</small>}
              {supervisor&&detail.sent_at&&!m.received_at&&<button className={styles.primary+" "+styles.receiveButton} onClick={()=>{setConfirmMachine(m);setRemark("");}}>Mark Received</button>}
            </div>
          </article>)}</div>
        </>}
      </section>
    </div>}
    {confirmMachine&&<div className={styles.modalShade} onClick={()=>setConfirmMachine(null)}><section className={styles.modal} role="dialog" aria-modal="true" onClick={e=>e.stopPropagation()}><h2>Mark {confirmMachine.name} received?</h2><p>This records that the machine has returned to your site.</p><label>Remark (optional)<textarea rows={3} value={remark} onChange={e=>setRemark(e.target.value)} placeholder="Condition or repair notes"/></label><div className={styles.modalActions}><button className={styles.secondary} onClick={()=>setConfirmMachine(null)}>Cancel</button><button className={styles.primary} onClick={saveReceived} disabled={busy}>{busy?"Saving…":"Confirm received"}</button></div></section></div>}
  </main>;
}
