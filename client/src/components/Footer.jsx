import { Link } from 'react-router-dom'
import { Flower2 } from 'lucide-react'

export default function Footer() {
    return (
        <footer className="bg-card border-t border-border py-12">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 rounded-lg bg-gradient-primary">
                                <Flower2 className="w-4 h-4 text-white" />
                            </div>
                            <span className="font-bold gradient-text">Lumina</span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Supporting your mental wellness journey
                        </p>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-4 text-foreground">Quick Links</h3>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link to="/chatbot" className="text-muted-foreground">
                                    AI Chat
                                </Link>
                            </li>
                            <li>
                                <Link to="/resources" className="text-muted-foreground">
                                    Resources
                                </Link>
                            </li>
                            <li>
                                <Link to="/community" className="text-muted-foreground">
                                    Community
                                </Link>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-4 text-foreground">Support</h3>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link to="/counseling" className="text-muted-foreground">
                                    Get Counseling
                                </Link>
                            </li>
                            <li>
                                <Link to="/emergency" className="text-muted-foreground">
                                    Emergency Help
                                </Link>
                            </li>
                            <li>
                                <a href="mailto:help@lumina.com" className="text-muted-foreground">
                                    Contact Us
                                </a>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="font-semibold mb-4 text-foreground">Legal</h3>
                        <ul className="space-y-2 text-sm">
                            <li>
                                <Link to="#" className="text-muted-foreground">
                                    Privacy Policy
                                </Link>
                            </li>
                            <li>
                                <Link to="#" className="text-muted-foreground">
                                    Terms of Service
                                </Link>
                            </li>
                            <li>
                                <Link to="#" className="text-muted-foreground">
                                    Cookie Policy
                                </Link>
                            </li>
                        </ul>
                    </div>
                </div>

                <div className="border-t border-border pt-8 text-center text-sm text-muted-foreground">
                    <p>
                        &copy; 2026 Lumina. All rights reserved. Supporting mental wellness for everyone.
                    </p>
                </div>
            </div>
        </footer>
    )
}