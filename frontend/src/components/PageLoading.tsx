/** What shows while a part of the app that is loaded on demand arrives. */
export default function PageLoading() {
    return (
        <div className="min-h-[50vh] flex items-center justify-center" role="status" aria-label="Loading">
            <div className="w-7 h-7 border-[3px] border-edge border-t-ink rounded-full animate-spin" />
        </div>
    );
}
