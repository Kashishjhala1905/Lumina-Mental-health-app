import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import ChatbotComponent from '@/components/chatbot/Chatbot'

export default function Chatbot() {
    return (
        <div className="flex flex-col min-h-screen bg-background">
            <Navbar />
            <main className="flex-1 px-4 sm:px-6 lg:px-8 py-12 max-w-6xl mx-auto w-full">
                <div className="mb-10 text-center">
                    <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
                        AI <span className="gradient-text">Mental Health Chat</span>
                    </h1>
                    <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                        Talk to our AI about your feelings and get supportive guidance in a safe, private space.
                    </p>
                </div>
                <ChatbotComponent />
            </main>
            <Footer />
        </div>
    )
}
