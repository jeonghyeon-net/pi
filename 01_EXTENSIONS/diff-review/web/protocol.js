const P=window.DiffReview;
function send(message){window.glimpse?.send?.(message)}
function nextId(){P.state.seq+=1;return `req:${Date.now()}:${P.state.seq}`}
P.requestCommit=(sha)=>send({type:"request-commit",requestId:nextId(),sha});
P.requestFile=(fileId)=>send({type:"request-file",requestId:nextId(),fileId,scope:P.state.scope,commitSha:P.state.scope==="commits"?P.state.selectedCommitSha:null});
P.requestRefresh=()=>send({type:"request-review-data",requestId:nextId()});
window.__reviewReceive=(message)=>{
	if(!message||typeof message!=="object")return;
	if(message.type==="commit-data"){P.state.commitFiles[message.sha]=message.files||[];P.ensureActiveFile();return P.render()}
	if(message.type==="commit-error")return P.renderError(message.message);
	if(message.type==="file-data"){P.state.fileContents[P.contentKey(message.scope,message.commitSha,message.fileId)]=message;return P.render()}
	if(message.type==="file-error")return P.renderError(message.message);
	if(message.type!=="review-data")return;
	P.data={...P.data,files:message.files||[],commits:message.commits||[],branchBaseRef:message.branchBaseRef??null,branchMergeBaseSha:message.branchMergeBaseSha??null,repositoryHasHead:message.repositoryHasHead===true};
	P.state.commitFiles={};P.state.fileContents={};if(!P.data.commits.some((c)=>c.sha===P.state.selectedCommitSha))P.state.selectedCommitSha=P.data.commits[0]?.sha||null;P.ensureActiveFile();P.render();
};
